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
import { parseDocument, tokenizeLine } from './lexer'
import { hashString } from './utils/hash'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { parseStructs } from './context/struct-table'
import { buildSymbolTable } from './context/symbol-table'
import type { SymbolEntry } from './context/symbol-table'
import { formatDocumentEdits } from './lsp/formatting'
import type { MacroDef } from './lexer/preprocessor'
import { analyzePreprocessor, resolveIncludeSymbols } from './lexer/preprocessor'
import { detectABI } from './utils/abi-detector'
import { annotateSource, annotateSourceEnhanced, buildEdits, buildFunctionComment, countCoveredLines } from './engine/comment-engine'
import { buildRemoveEdits } from './engine/deduplicator'
import { stripAllCommentsEdits } from './engine/strip-comments'
import { createLLMAdapter } from './llm'
import type { LLMAdapter } from './llm'
import { hoverAt } from './lsp/hover'
import {
  Location,
  DocumentSymbol,
  SymbolKind,
  WorkspaceEdit,
  TextEdit
} from 'vscode-languageserver/node'
import { provideCodeActions } from './lsp/code-action'
import { provideCompletions } from './lsp/completion'
import { validateDocument } from './lsp/diagnostics'
import { provideVirtualComments } from './lsp/inlay-hints'
import type { DiagnosticData } from './lsp/diagnostics'
import { DocumentContext } from './context/document-context'
import type { VirtualComment } from './lsp/inlay-hints'
import type { StructDef } from './types'
import { findCommentStart } from './utils/indent'

export class NASMLanguageServer {
  private connection = createConnection(ProposedFeatures.all)
  private documents = new TextDocuments(TextDocument)
  private stores: KnowledgeStores | null = null
  private config: CommentConfig = resolveConfig()
  private llm: LLMAdapter | undefined
  private workspaceKey = ''
  /** 每文档 ABI 检测缓存（按版本失效） */
  private abiCache = new Map<string, { version: number; abi: ReturnType<typeof detectABI> }>()
  /** 每文档虚拟注释缓存（按版本失效，sections 供 textOnly 过滤） */
  private virtualCache = new Map<string, { version: number; hints: VirtualComment[]; sections: string[] }>()
  /** 每文档 %define 常量缓存（按版本失效） */
  private definesCache = new Map<string, { version: number; defines: Map<string, string> }>()
  /** 每文档结构体表缓存（按版本失效） */
  private structsCache = new Map<string, { version: number; structs: Map<string, StructDef> }>()
  /** 每文档符号表缓存（按版本失效） */
  private symbolsCache = new Map<string, { version: number; symbols: SymbolEntry[] }>()
  /** 每文档预处理符号缓存（含 %include 合并，按版本失效） */
  private preprocessCache = new Map<string, { version: number; defines: Map<string, string>; macros: Map<string, MacroDef> }>()
  /** 诊断防抖定时器（按 uri） */
  private readonly diagTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /** 依据最新配置重建 LLM 适配器（未启用或 provider 缺失时为 undefined）。 */
  private refreshLLM(): void {
    this.llm = createLLMAdapter(this.config.llm, this.workspaceKey)
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
      this.virtualCache.delete(event.document.uri)
      this.definesCache.delete(event.document.uri)
      this.structsCache.delete(event.document.uri)
      this.symbolsCache.delete(event.document.uri)
      this.pushCoverage(event.document)
      this.validateAndPush(event.document)
    })
    this.documents.onDidChangeContent((event) => {
      this.abiCache.delete(event.document.uri)
      this.virtualCache.delete(event.document.uri)
      this.definesCache.delete(event.document.uri)
      this.structsCache.delete(event.document.uri)
      this.symbolsCache.delete(event.document.uri)
      this.validateAndPushDebounced(event.document)
    })
    this.documents.onDidClose((event) => {
      this.abiCache.delete(event.document.uri)
      this.virtualCache.delete(event.document.uri)
      this.definesCache.delete(event.document.uri)
      this.structsCache.delete(event.document.uri)
      this.symbolsCache.delete(event.document.uri)
      const timer = this.diagTimers.get(event.document.uri)
      if (timer !== undefined) {
        clearTimeout(timer)
        this.diagTimers.delete(event.document.uri)
      }
      void this.connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
    })
    this.connection.onDidChangeConfiguration((params) => {
      const virtualChanged = this.config.virtual !== this.extractConfigSettings(params.settings).virtual
      this.config = resolveConfig(this.extractConfigSettings(params.settings))
      this.refreshLLM()
      this.virtualCache.clear()
      if (virtualChanged) {
        this.requestInlayRefresh()
      }
    })
    this.connection.onNotification('nasm-commenter/configDidChange', (params: ConfigDidChangeParams) => {
      const virtualChanged = this.config.virtual !== params.config.virtual
      this.config = resolveConfig(params.config)
      this.refreshLLM()
      this.virtualCache.clear()
      if (virtualChanged) {
        this.requestInlayRefresh()
      }
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
    this.connection.onRequest('nasm-commenter/firstUnannotated', this.onFirstUnannotated.bind(this))
    this.connection.onRequest('nasm-commenter/clearLlmCache', this.onClearLlmCache.bind(this))
    this.connection.onDefinition(this.onDefinition.bind(this))
    this.connection.onReferences(this.onReferences.bind(this))
    this.connection.onRenameRequest(this.onRename.bind(this))
    this.connection.onDocumentSymbol(this.onDocumentSymbol.bind(this))
    this.connection.onDocumentFormatting(this.onDocumentFormatting.bind(this))
    this.connection.listen()
  }

  private onInitialize(params: InitializeParams): InitializeResult {
    const partial = params.initializationOptions as Partial<CommentConfig> | undefined
    this.config = resolveConfig(partial)
    this.workspaceKey = hashString(params.rootUri ?? '')
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
        inlayHintProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        renameProvider: true,
        documentSymbolProvider: true,
        documentFormattingProvider: true
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
    const markdown = hoverAt(lineText, params.position.character, abi, stores, {
      defines: this.definesOf(doc),
      structs: this.structsOf(doc)
    })
    if (markdown === null) {
      return null
    }
    return {
      contents: { kind: MarkupKind.Markdown, value: markdown }
    }
  }

  /** 每文档预处理符号（含 %include 合并；按版本缓存）。 */
  private preprocessSymbolsOf(doc: TextDocument): {
    defines: Map<string, string>
    macros: Map<string, MacroDef>
  } {
    const cached = this.preprocessCache.get(doc.uri)
    if (cached !== undefined && cached.version === doc.version) {
      return cached
    }
    const docDir = this.docDirectory(doc.uri)
    const merged = resolveIncludeSymbols(doc.getText(), docDir)
    const result = { version: doc.version, defines: merged.defines, macros: merged.macros }
    this.preprocessCache.set(doc.uri, result)
    return result
  }

  /** 从 file:// URI 解析文档目录；非 file 协议返回 undefined（跳过 include 合并）。 */
  private docDirectory(uri: string): string | undefined {
    if (!uri.startsWith('file://')) {
      return undefined
    }
    try {
      return path.dirname(fileURLToPath(uri))
    } catch {
      return undefined
    }
  }

  /** 每文档 %define 常量表（按版本缓存，含 %include 合并）。 */
  private definesOf(doc: TextDocument): Map<string, string> {
    const symbols = this.preprocessSymbolsOf(doc)
    return symbols.defines
  }

  /** 每文档结构体表（按版本缓存）。 */
  private structsOf(doc: TextDocument): Map<string, StructDef> {
    const cached = this.structsCache.get(doc.uri)
    if (cached !== undefined && cached.version === doc.version) {
      return cached.structs
    }
    const structs = parseStructs(parseDocument(doc.getText()))
    this.structsCache.set(doc.uri, { version: doc.version, structs })
    return structs
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
    // %include 引入的常量/宏同样参与补全
    for (const [name] of this.preprocessSymbolsOf(doc).defines) {
      if (!seen.has(name)) {
        seen.add(name)
        labelNames.push(name)
      }
    }
    return provideCompletions(lineText, params.position.character, stores, labelNames)
  }

  private async annotate(text: string, config: CommentConfig, range?: { startLine: number; endLine: number }): Promise<{ edits: AnnotateFileResponse['edits']; abi: ReturnType<typeof detectABI>; stats: AnnotateFileResponse['stats']; covered: number }> {
    // 写入路径：supplement 模式（默认）不调用 LLM——LLM 结果只进虚拟预览；
    // fallback 模式写入包含 LLM 行（注意：该模式下的 LLM 行无法自动移除）
    const useLlm = config.llm.augmentMode === 'fallback'
    const ann = await annotateSourceEnhanced(text, this.requireStores(), config, useLlm ? this.llm : undefined, range)
    const edits = buildEdits(ann.lines, ann.comments, config)
    return { edits, abi: ann.abi, stats: ann.stats, covered: countCoveredLines(ann.comments) }
  }

  private async onAnnotateFile(params: AnnotateFileRequest): Promise<AnnotateFileResponse> {
    const doc = this.requireDoc(params.textDocument.uri)
    const config = resolveConfig({ ...this.config, ...params.config })
    const result = await this.annotate(doc.getText(), config)
    this.pushCoverageCount(doc, result.covered, result.stats.bySource)
    return result
  }

  private async onAnnotateSelection(params: AnnotateSelectionRequest): Promise<AnnotateFileResponse> {
    const doc = this.requireDoc(params.textDocument.uri)
    const config = resolveConfig({ ...this.config, ...params.config })
    const result = await this.annotate(doc.getText(), config, {
      startLine: params.startLine,
      endLine: params.endLine
    })
    this.pushCoverageCount(doc, result.covered, result.stats.bySource)
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

  /** 请求客户端刷新虚拟注释（配置开关变化后即时生效）。 */
  private requestInlayRefresh(): void {
    try {
      void this.connection.languages.inlayHint.refresh()
    } catch (e) {
      logger.debug(`inlayHint refresh 不可用: ${String(e)}`)
    }
  }

  /** 虚拟注释（Inlay Hint 幽灵文字预览，不修改文档；结果按文档版本缓存）。 */
  private async onInlayHints(params: {
    textDocument: { uri: string }
    range: { start: { line: number }; end: { line: number } }
  }): Promise<InlayHint[]> {
    if (!this.config.virtual || this.stores === null) {
      return []
    }
    const doc = this.documents.get(params.textDocument.uri)
    if (doc === undefined) {
      return []
    }
    let cached = this.virtualCache.get(doc.uri)
    if (cached === undefined || cached.version !== doc.version) {
      const config = resolveConfig({ ...this.config, protectExistingComments: false })
      // 虚拟层在 LLM 启用时总是增强（supplement/fallback 都先出现在预览中）
      const ann = await annotateSourceEnhanced(doc.getText(), this.stores, config, this.llm)
      const context = new DocumentContext(ann.lines, ann.abi, this.stores.syscalls)
      cached = {
        version: doc.version,
        hints: provideVirtualComments(ann.lines, ann.comments, this.stores),
        sections: ann.lines.map((l) => context.getSectionAt(l.lineNumber))
      }
      this.virtualCache.set(doc.uri, cached)
    }
    const textOnly = this.config.virtualScope === 'textOnly'
    return cached.hints
      .filter((v) => {
        if (v.line < params.range.start.line || v.line > params.range.end.line) {
          return false
        }
        if (textOnly) {
          const section = cached.sections[v.line] ?? '.text'
          return section === '.text' || section === '.rodata'
        }
        return true
      })
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
  private pushCoverageCount(doc: TextDocument, covered: number, bySource?: Record<string, number>): void {
    const notification: StatsNotificationParams = {
      uri: doc.uri,
      abi: this.abiOf(doc),
      stats: {
        totalLines: doc.lineCount,
        commentedLines: covered,
        skippedLines: 0,
        bySource: bySource ?? { rule: 0, pattern: 0, context: 0, llm: 0, fallback: 0 }
      }
    }
    void this.connection.sendNotification('nasm-commenter/stats', notification)
  }

  /** 打开文档时的覆盖率统计（独立全量计算一次）。 */
  private pushCoverage(doc: TextDocument): void {
    try {
      const config = resolveConfig({ ...this.config, protectExistingComments: false })
      const ann = annotateSource(doc.getText(), this.requireStores(), config)
      this.pushCoverageCount(doc, countCoveredLines(ann.comments))
    } catch (e) {
      logger.warn(`覆盖率统计失败: ${String(e)}`)
    }
  }

  /** 校验文档并推送诊断（未知指令 / 未定义跳转目标 / 未引用标签 / 预处理问题 / 条件不确定）。 */
  private validateAndPush(doc: TextDocument): void {
    if (this.stores === null) {
      return
    }
    const text = doc.getText()
    const diagnostics = validateDocument(text, this.stores).map((d: DiagnosticData) => ({
      severity: d.severity,
      range: {
        start: { line: d.line, character: d.character },
        end: { line: d.line, character: d.character + d.length }
      },
      message: d.message,
      source: 'nasm-commenter'
    }))
    // 预处理层诊断：嵌套不平衡 (Warning) 与条件汇编不确定 (Hint)
    const analysis = analyzePreprocessor(text)
    for (const issue of analysis.issues) {
      diagnostics.push({
        severity: issue.severity,
        range: {
          start: { line: issue.line, character: 0 },
          end: { line: issue.line, character: 0 }
        },
        message: issue.message,
        source: 'nasm-commenter'
      })
    }
    for (const ln of analysis.conditionalLines) {
      diagnostics.push({
        severity: 4,
        range: {
          start: { line: ln, character: 0 },
          end: { line: ln, character: 0 }
        },
        message: '条件汇编分支不确定, 注释仅供参考',
        source: 'nasm-commenter'
      })
    }
    void this.connection.sendDiagnostics({ uri: doc.uri, diagnostics })
  }

  /** 第一个未注释的指令行（状态栏跳转用；无则返回 null）。 */
  /** 清空 LLM 缓存（clearLlmCache 命令）。 */
  private onClearLlmCache(): { cleared: boolean } {
    this.llm?.clearCache?.()
    logger.info('LLM 缓存已清空')
    return { cleared: true }
  }

  private onFirstUnannotated(params: { textDocument: { uri: string } }): { line: number } | null {
    const doc = this.requireDoc(params.textDocument.uri)
    const config = resolveConfig({ ...this.config, protectExistingComments: false })
    const ann = annotateSource(doc.getText(), this.requireStores(), config)
    for (const line of ann.lines) {
      if (line.kind !== 'instruction') {
        continue
      }
      const result = ann.comments.get(line.lineNumber)
      const covered = result !== undefined && (result.skipped === true || result.comment.length > 0)
      if (!covered) {
        return { line: line.lineNumber }
      }
    }
    return null
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

  /** 每文档符号表（按版本缓存，%define/宏来自 include 合并结果）。 */
  private symbolsOf(doc: TextDocument): SymbolEntry[] {
    const cached = this.symbolsCache.get(doc.uri)
    if (cached !== undefined && cached.version === doc.version) {
      return cached.symbols
    }
    const symbols = buildSymbolTable(
      parseDocument(doc.getText()),
      this.preprocessSymbolsOf(doc).defines,
      this.preprocessSymbolsOf(doc).macros,
      this.structsOf(doc)
    )
    this.symbolsCache.set(doc.uri, { version: doc.version, symbols })
    return symbols
  }

  /** 光标处标识符 token（不在标识符上时返回 null）。 */
  private identifierAt(
    doc: TextDocument,
    position: { line: number; character: number }
  ): { value: string; start: number; end: number } | null {
    const lineText = doc.getText().split(/\r?\n/)[position.line] ?? ''
    for (const tok of tokenizeLine(lineText)) {
      if (
        tok.type === 'identifier' &&
        position.character >= tok.start &&
        position.character <= tok.end
      ) {
        return { value: tok.value, start: tok.start, end: tok.end }
      }
    }
    return null
  }

  private onDefinition(params: {
    textDocument: { uri: string }
    position: { line: number; character: number }
  }): Location | null {
    const doc = this.documents.get(params.textDocument.uri)
    if (doc === undefined) {
      return null
    }
    const token = this.identifierAt(doc, params.position)
    if (token === null) {
      return null
    }
    const target = this.symbolsOf(doc).find((s) => s.name === token.value)
    if (target === undefined) {
      return null
    }
    return {
      uri: params.textDocument.uri,
      range: {
        start: { line: target.line, character: target.character },
        end: { line: target.line, character: target.character + target.length }
      }
    }
  }

  private onReferences(params: {
    textDocument: { uri: string }
    position: { line: number; character: number }
    context: { includeDeclaration: boolean }
  }): Location[] {
    const doc = this.documents.get(params.textDocument.uri)
    if (doc === undefined) {
      return []
    }
    const token = this.identifierAt(doc, params.position)
    if (token === null) {
      return []
    }
    const symbols = this.symbolsOf(doc)
    const declaration = symbols.find((s) => s.name === token.value)
    const locations: Location[] = []
    if (params.context.includeDeclaration && declaration !== undefined) {
      locations.push({
        uri: params.textDocument.uri,
        range: {
          start: { line: declaration.line, character: declaration.character },
          end: { line: declaration.line, character: declaration.character + declaration.length }
        }
      })
    }
    const lines = doc.getText().split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      for (const tok of tokenizeLine(lines[i])) {
        if (tok.type === 'identifier' && tok.value === token.value) {
          if (
            declaration !== undefined &&
            declaration.line === i &&
            declaration.character === tok.start
          ) {
            continue
          }
          locations.push({
            uri: params.textDocument.uri,
            range: {
              start: { line: i, character: tok.start },
              end: { line: i, character: tok.end }
            }
          })
        }
      }
    }
    return locations
  }

  private onRename(params: {
    textDocument: { uri: string }
    position: { line: number; character: number }
    newName: string
  }): WorkspaceEdit {
    const result: WorkspaceEdit = { changes: {} }
    if (!/^[A-Za-z_.$?@][\w.$?@]*$/.test(params.newName)) {
      throw new Error(`非法的 NASM 标识符: ${params.newName}`)
    }
    const doc = this.requireDoc(params.textDocument.uri)
    const token = this.identifierAt(doc, params.position)
    if (token === null) {
      return result
    }
    const edits: TextEdit[] = []
    const lines = doc.getText().split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      for (const tok of tokenizeLine(lines[i])) {
        if (tok.type === 'identifier' && tok.value === token.value) {
          edits.push({
            range: {
              start: { line: i, character: tok.start },
              end: { line: i, character: tok.end }
            },
            newText: params.newName
          })
        }
      }
    }
    result.changes = { [params.textDocument.uri]: edits }
    return result
  }

  private onDocumentSymbol(params: {
    textDocument: { uri: string }
  }): DocumentSymbol[] {
    const doc = this.documents.get(params.textDocument.uri)
    if (doc === undefined) {
      return []
    }
    const kindMap: Record<string, SymbolKind> = {
      label: SymbolKind.Variable,
      function: SymbolKind.Function,
      define: SymbolKind.Constant,
      macro: SymbolKind.Function,
      'struct-field': SymbolKind.Field
    }
    const lines = doc.getText().split(/\r?\n/)
    return this.symbolsOf(doc).map((s) => {
      const lineEnd = (lines[s.line] ?? '').length
      const selection =
        s.length > 0
          ? {
            start: { line: s.line, character: s.character },
            end: { line: s.line, character: s.character + s.length }
          }
          : { start: { line: s.line, character: 0 }, end: { line: s.line, character: 0 } }
      const symbol: DocumentSymbol = {
        name: s.name,
        kind: kindMap[s.kind] ?? SymbolKind.Variable,
        range: {
          start: { line: s.line, character: 0 },
          end: { line: s.line, character: lineEnd }
        },
        selectionRange: selection
      }
      if (s.detail !== undefined) {
        symbol.detail = s.detail
      }
      return symbol
    })
  }

  private onDocumentFormatting(params: {
    textDocument: { uri: string }
    options: { tabSize?: number; insertSpaces?: boolean }
  }): TextEdit[] {
    if (!resolveConfig({ ...this.config }).format.enable) {
      return []
    }
    const doc = this.requireDoc(params.textDocument.uri)
    return formatDocumentEdits(doc.getText()).map((e) => ({
      range: {
        start: { line: e.startLine, character: e.startCharacter },
        end: { line: e.endLine, character: e.endCharacter }
      },
      newText: e.newText
    }))
  }
}
