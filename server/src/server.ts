/**
 * LSP 服务器：生命周期管理、文档同步、自定义注释请求、Hover 与 CodeAction。
 *
 * 关键约束：stdout 是 JSON-RPC 协议通道，日志一律走 stderr（logger）。
 */
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Hover,
  MarkupKind,
  CodeAction,
  CodeActionKind,
  Command,
  CompletionItem,
  InlayHint,
  InlayHintKind,
  ResponseError
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import type {
  CommentConfig,
  AnnotateFileRequest,
  AnnotateFileResponse,
  AnnotateSelectionRequest,
  AnnotateFunctionRequest,
  AnnotateFunctionResponse,
  RemoveCommentsRequest,
  RemoveCommentsResponse,
  StripAllCommentsRequest,
  StripAllCommentsResponse,
  ConfigDidChangeParams,
  StatsNotificationParams
} from './types'
import type { KnowledgeStores } from './knowledge'
import { loadKnowledge, buildStores } from './knowledge'
import { resolveConfig } from './utils/config-defaults'
import { logger } from './utils/logger'
import { parseDocument } from './lexer'
import { detectABI } from './utils/abi-detector'
import { annotateSource, annotateSourceEnhanced, buildEdits, buildFunctionComment } from './engine/comment-engine'
import { applyEditsToText, buildRemoveEdits } from './engine/deduplicator'
import { stripAllCommentsEdits } from './engine/strip-comments'
import { createLLMAdapter } from './llm'
import type { LLMAdapter } from './llm'
import { hoverAt } from './lsp/hover'
import { provideCodeActions } from './lsp/code-action'
import { provideCompletions } from './lsp/completion'
import { validateDocument } from './lsp/diagnostics'
import { provideVirtualComments } from './lsp/inlay-hints'
import type { DiagnosticData } from './lsp/diagnostics'
import { findCommentStart } from './utils/indent'

export class NASMLanguageServer {
  private connection = createConnection(ProposedFeatures.all)
  private documents = new TextDocuments(TextDocument)
  private stores: KnowledgeStores | null = null
  private config: CommentConfig = resolveConfig()
  private llm: LLMAdapter | undefined
  /** 每文档 ABI 检测缓存（按版本失效） */
  private abiCache = new Map<string, { version: number; abi: ReturnType<typeof detectABI> }>()
  /** 诊断防抖定时器（按 uri） */
  private readonly diagTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /** 依据最新配置重建 LLM 适配器（未启用或 provider 缺失时为 undefined）。 */
  private refreshLLM(): void {
    this.llm = createLLMAdapter(this.config.llm)
  }

  /**
   * 兼容两种 settings 形态：LanguageClient 按 synchronize.configurationSection
   * 同步时发送 `{ 'nasm-commenter': {...} }`，需解包 section key。
   */
  private extractConfigSettings(settings: unknown): Partial<CommentConfig> {
    if (settings !== null && typeof settings === 'object' && 'nasm-commenter' in settings) {
      const section = (settings as Record<string, unknown>)['nasm-commenter']
      if (section !== null && typeof section === 'object') {
        return section as Partial<CommentConfig>
      }
    }
    return settings as Partial<CommentConfig>
  }

  /** LSP 错误码（避免依赖具体版本枚举导出）。 */
  private static readonly ERR_INTERNAL = -32603
  private static readonly ERR_INVALID_PARAMS = -32602
  private static readonly ERR_NOT_INITIALIZED = -32002

  start(): void {
    this.connection.onInitialize(this.onInitialize.bind(this))
    this.documents.listen(this.connection)
    this.documents.onDidOpen((event) => {
      this.abiCache.delete(event.document.uri)
      this.pushCoverage(event.document)
      this.validateAndPush(event.document)
    })
    this.documents.onDidChangeContent((event) => {
      this.abiCache.delete(event.document.uri)
      this.validateAndPushDebounced(event.document)
    })
    this.documents.onDidClose((event) => {
      this.abiCache.delete(event.document.uri)
      const timer = this.diagTimers.get(event.document.uri)
      if (timer !== undefined) {
        clearTimeout(timer)
        this.diagTimers.delete(event.document.uri)
      }
      void this.connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
    })
    this.connection.onDidChangeConfiguration((params) => {
      this.config = resolveConfig(this.extractConfigSettings(params.settings))
      this.refreshLLM()
    })
    this.connection.onNotification('nasm-commenter/configDidChange', (params: ConfigDidChangeParams) => {
      this.config = resolveConfig(params.config)
      this.refreshLLM()
    })
    this.connection.onHover(this.onHover.bind(this))
    this.connection.onCodeAction(this.onCodeAction.bind(this))
    this.connection.onCompletion(this.onCompletion.bind(this))
    this.connection.languages.inlayHint.on(this.onInlayHints.bind(this))
    this.connection.onRequest('nasm-commenter/annotateFile', this.onAnnotateFile.bind(this))
    this.connection.onRequest('nasm-commenter/annotateSelection', this.onAnnotateSelection.bind(this))
    this.connection.onRequest('nasm-commenter/annotateFunction', this.onAnnotateFunction.bind(this))
    this.connection.onRequest('nasm-commenter/removeComments', this.onRemoveComments.bind(this))
    this.connection.onRequest('nasm-commenter/stripAllComments', this.onStripAllComments.bind(this))
    this.connection.listen()
  }

  private onInitialize(params: InitializeParams): InitializeResult {
    const partial = params.initializationOptions as Partial<CommentConfig> | undefined
    this.config = resolveConfig(partial)
    this.refreshLLM()
    try {
      const stores = buildStores(loadKnowledge())
      this.stores = stores
      logger.info(`知识库加载完成: ${stores.instructions.getAllMnemonics().length} 条指令`)
    } catch (e) {
      logger.error(`知识库加载失败: ${String(e)}`)
      throw new ResponseError(NASMLanguageServer.ERR_INTERNAL, `NASM Commenter 知识库加载失败: ${String(e)}`)
    }
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        codeActionProvider: true,
        completionProvider: { resolveProvider: false },
        inlayHintProvider: true
      }
    }
  }

  /** 取文档 ABI（带版本缓存）。 */
  private abiOf(doc: TextDocument): ReturnType<typeof detectABI> {
    const cached = this.abiCache.get(doc.uri)
    if (cached !== undefined && cached.version === doc.version) {
      return cached.abi
    }
    const abi = detectABI(parseDocument(doc.getText()))
    this.abiCache.set(doc.uri, { version: doc.version, abi })
    return abi
  }

  private requireDoc(uri: string): TextDocument {
    const doc = this.documents.get(uri)
    if (doc === undefined) {
      throw new ResponseError(NASMLanguageServer.ERR_INVALID_PARAMS, `文档未打开: ${uri}`)
    }
    return doc
  }

  private requireStores(): KnowledgeStores {
    if (this.stores === null) {
      throw new ResponseError(NASMLanguageServer.ERR_NOT_INITIALIZED, '服务器尚未初始化完成')
    }
    return this.stores
  }

  private onHover(params: { textDocument: { uri: string }; position: { line: number; character: number } }): Hover | null {
    const stores = this.stores
    if (stores === null) {
      return null
    }
    const doc = this.documents.get(params.textDocument.uri)
    if (doc === undefined) {
      return null
    }
    const lines = doc.getText().split(/\r?\n/)
    const lineText = lines[params.position.line] ?? ''
    const abi = this.abiOf(doc)
    const markdown = hoverAt(lineText, params.position.character, abi, stores)
    if (markdown === null) {
      return null
    }
    return {
      contents: { kind: MarkupKind.Markdown, value: markdown }
    }
  }

  private onCodeAction(params: {
    textDocument: { uri: string }
    range: { start: { line: number; character: number }; end: { line: number; character: number } }
  }): CodeAction[] {
    const doc = this.documents.get(params.textDocument.uri)
    if (doc === undefined) {
      return []
    }
    const lines = doc.getText().split(/\r?\n/)
    const lineText = lines[params.range.start.line] ?? ''
    const multiLine = params.range.start.line !== params.range.end.line
    return provideCodeActions(lineText, multiLine).map((action) => {
      const result: CodeAction = {
        title: action.title,
        kind: CodeActionKind.RefactorRewrite,
        command: action.command as Command
      }
      return result
    })
  }

  private onCompletion(params: {
    textDocument: { uri: string }
    position: { line: number; character: number }
  }): CompletionItem[] {
    const stores = this.requireStores()
    const doc = this.documents.get(params.textDocument.uri)
    if (doc === undefined) {
      return []
    }
    const lines = doc.getText().split(/\r?\n/)
    const lineText = lines[params.position.line] ?? ''
    const parsed = parseDocument(doc.getText())
    const labelNames: string[] = []
    const seen = new Set<string>()
    for (const l of parsed) {
      if (l.label !== undefined && !seen.has(l.label)) {
        seen.add(l.label)
        labelNames.push(l.label)
      }
      // %define 宏常量也是合法操作数
      if (l.directive === '%define' && l.directiveArgs?.[0]) {
        const name = l.directiveArgs[0].split(/\s+/)[0]
        if (name.length > 0 && !seen.has(name)) {
          seen.add(name)
          labelNames.push(name)
        }
      }
    }
    return provideCompletions(lineText, params.position.character, stores, labelNames)
  }

  private async annotate(text: string, config: CommentConfig, range?: { startLine: number; endLine: number }): Promise<{ edits: AnnotateFileResponse['edits']; abi: ReturnType<typeof detectABI>; stats: AnnotateFileResponse['stats'] }> {
    const ann = await annotateSourceEnhanced(text, this.requireStores(), config, this.llm, range)
    const edits = buildEdits(ann.lines, ann.comments, config)
    return { edits, abi: ann.abi, stats: ann.stats }
  }

  private async onAnnotateFile(params: AnnotateFileRequest): Promise<AnnotateFileResponse> {
    const doc = this.requireDoc(params.textDocument.uri)
    const config = resolveConfig({ ...this.config, ...params.config })
    const result = await this.annotate(doc.getText(), config)
    this.pushCoverage(doc, applyEditsToText(doc.getText(), result.edits))
    return result
  }

  private async onAnnotateSelection(params: AnnotateSelectionRequest): Promise<AnnotateFileResponse> {
    const doc = this.requireDoc(params.textDocument.uri)
    const config = resolveConfig({ ...this.config, ...params.config })
    const result = await this.annotate(doc.getText(), config, {
      startLine: params.startLine,
      endLine: params.endLine
    })
    this.pushCoverage(doc, applyEditsToText(doc.getText(), result.edits))
    return result
  }

  private async onAnnotateFunction(params: AnnotateFunctionRequest): Promise<AnnotateFunctionResponse | null> {
    const doc = this.requireDoc(params.textDocument.uri)
    const config = resolveConfig({ ...this.config })
    const ann = await annotateSourceEnhanced(doc.getText(), this.requireStores(), config, this.llm)
    const fc = buildFunctionComment(ann, params.line, config)
    if (fc === null) {
      return null
    }
    return {
      functionName: fc.fn.name,
      functionStartLine: fc.fn.startLine,
      blockComment: fc.blockCommentLines.join('\n'),
      edits: [fc.edit],
      confidence: fc.confidence
    }
  }

  /** 虚拟注释（Inlay Hint 幽灵文字预览，不修改文档）。 */
  private onInlayHints(params: {
    textDocument: { uri: string }
    range: { start: { line: number }; end: { line: number } }
  }): InlayHint[] {
    if (!resolveConfig({ ...this.config }).virtual || this.stores === null) {
      return []
    }
    const doc = this.documents.get(params.textDocument.uri)
    if (doc === undefined) {
      return []
    }
    const config = resolveConfig({ ...this.config, protectExistingComments: false })
    const ann = annotateSource(doc.getText(), this.requireStores(), config)
    const virtual = provideVirtualComments(ann.lines, ann.comments, this.requireStores())
    return virtual
      .filter((v) => v.line >= params.range.start.line && v.line <= params.range.end.line)
      .map((v): InlayHint => ({
        position: { line: v.line, character: v.character },
        label: v.label,
        kind: InlayHintKind.Parameter,
        paddingLeft: true,
        tooltip: v.tooltip !== undefined ? { kind: MarkupKind.Markdown, value: v.tooltip } : undefined
      }))
  }

  /** 去掉所有注释（含手写注释）：整行注释删行，行尾注释剥离。 */
  private onStripAllComments(params: StripAllCommentsRequest): StripAllCommentsResponse {
    const doc = this.requireDoc(params.textDocument.uri)
    const edits = stripAllCommentsEdits(doc.getText())
    return { edits, count: edits.length }
  }

  private onRemoveComments(params: RemoveCommentsRequest): RemoveCommentsResponse {
    const doc = this.requireDoc(params.textDocument.uri)
    const text = doc.getText()
    const lines = text.split(/\r?\n/)
    const config = resolveConfig({ ...this.config, protectExistingComments: false })

    // 标记模式：按 marker 扫描精确移除
    if (config.marker.length > 0) {
      const edits = []
      for (let i = 0; i < lines.length; i++) {
        edits.push(...buildRemoveEdits(lines[i], i, config.marker))
      }
      return { edits, count: edits.length }
    }

    // 内容匹配模式：重新生成规则注释，与行内现有注释一致的移除；
    // `旧注释 / 新注释` 追加形式只剥离追加部分。LLM 增强的注释不参与（无法确定性重生成）。
    const ann = annotateSource(text, this.requireStores(), config)
    const edits = []
    const claimedAbove = new Set<number>()
    for (const [lineNumber, result] of ann.comments) {
      const gen = result.comment.trim()
      if (gen.length === 0) {
        continue
      }
      if (config.style === 'above') {
        for (let i = 0; i < lines.length; i++) {
          if (claimedAbove.has(i)) {
            continue
          }
          const m = /^[ \t]*; (.+)$/.exec(lines[i])
          if (m !== null && m[1].trim() === gen) {
            claimedAbove.add(i)
            const isLast = i === lines.length - 1
            edits.push({
              startLine: i,
              startCharacter: 0,
              endLine: isLast ? i : i + 1,
              endCharacter: isLast ? lines[i].length : 0,
              newText: ''
            })
            break
          }
        }
        continue
      }
      const line = lines[lineNumber]
      if (line === undefined) {
        continue
      }
      const idx = findCommentStart(line)
      if (idx < 0) {
        continue
      }
      const existing = line.slice(idx + 1).trim()
      if (existing === gen) {
        let start = idx
        while (start > 0 && /[ \t]/.test(line[start - 1])) {
          start--
        }
        edits.push({
          startLine: lineNumber,
          startCharacter: start,
          endLine: lineNumber,
          endCharacter: line.length,
          newText: ''
        })
        continue
      }
      const suffix = ` / ${gen}`
      if (existing.endsWith(suffix)) {
        const abs = idx + 1 + line.slice(idx + 1).lastIndexOf(suffix)
        edits.push({
          startLine: lineNumber,
          startCharacter: abs,
          endLine: lineNumber,
          endCharacter: line.length,
          newText: ''
        })
      }
    }
    return { edits, count: edits.length }
  }

  /** 推送注释覆盖率（状态栏展示：规则引擎可注释/已注释行 / 总行数）。 */
  private pushCoverage(doc: TextDocument, text?: string): void {
    const content = text ?? doc.getText()
    let covered = 0
    try {
      const config = resolveConfig({ ...this.config, protectExistingComments: false })
      const ann = annotateSource(content, this.requireStores(), config)
      for (const result of ann.comments.values()) {
        if (result.skipped !== true || result.skipReason === '注释未变化') {
          covered++
        }
      }
    } catch (e) {
      logger.warn(`覆盖率统计失败: ${String(e)}`)
    }
    const notification: StatsNotificationParams = {
      uri: doc.uri,
      abi: this.abiOf(doc),
      stats: {
        totalLines: content.split(/\r?\n/).length,
        commentedLines: covered,
        skippedLines: 0,
        bySource: { rule: 0, pattern: 0, context: 0, llm: 0, fallback: 0 }
      }
    }
    void this.connection.sendNotification('nasm-commenter/stats', notification)
  }

  /** 校验文档并推送诊断（未知指令 / 未定义跳转目标）。 */
  private validateAndPush(doc: TextDocument): void {
    if (this.stores === null) {
      return
    }
    const diagnostics = validateDocument(doc.getText(), this.stores).map((d: DiagnosticData) => ({
      severity: d.severity,
      range: {
        start: { line: d.line, character: d.character },
        end: { line: d.line, character: d.character + d.length }
      },
      message: d.message,
      source: 'nasm-commenter'
    }))
    void this.connection.sendDiagnostics({ uri: doc.uri, diagnostics })
  }

  /** 编辑触发的诊断推送带 300ms 防抖，避免每次按键全量校验。 */
  private validateAndPushDebounced(doc: TextDocument): void {
    const existing = this.diagTimers.get(doc.uri)
    if (existing !== undefined) {
      clearTimeout(existing)
    }
    const timer = setTimeout(() => {
      this.diagTimers.delete(doc.uri)
      this.validateAndPush(doc)
    }, 300)
    this.diagTimers.set(doc.uri, timer)
  }
}
