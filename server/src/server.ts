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
  ConfigDidChangeParams,
  StatsNotificationParams
} from './types'
import type { KnowledgeStores } from './knowledge'
import { loadKnowledge, buildStores } from './knowledge'
import { resolveConfig } from './utils/config-defaults'
import { logger } from './utils/logger'
import { parseDocument } from './lexer'
import { detectABI } from './utils/abi-detector'
import { annotateSourceEnhanced, buildEdits, buildFunctionComment } from './engine/comment-engine'
import { buildRemoveEdits } from './engine/deduplicator'
import { createLLMAdapter } from './llm'
import type { LLMAdapter } from './llm'
import { hoverAt } from './lsp/hover'
import { provideCodeActions } from './lsp/code-action'

export class NASMLanguageServer {
  private connection = createConnection(ProposedFeatures.all)
  private documents = new TextDocuments(TextDocument)
  private stores: KnowledgeStores | null = null
  private config: CommentConfig = resolveConfig()
  private llm: LLMAdapter | undefined
  /** 每文档 ABI 检测缓存（按版本失效） */
  private abiCache = new Map<string, { version: number; abi: ReturnType<typeof detectABI> }>()

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
    this.documents.onDidChangeContent((event) => {
      const doc = event.document
      this.abiCache.delete(doc.uri)
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
    this.connection.onRequest('nasm-commenter/annotateFile', this.onAnnotateFile.bind(this))
    this.connection.onRequest('nasm-commenter/annotateSelection', this.onAnnotateSelection.bind(this))
    this.connection.onRequest('nasm-commenter/annotateFunction', this.onAnnotateFunction.bind(this))
    this.connection.onRequest('nasm-commenter/removeComments', this.onRemoveComments.bind(this))
    this.connection.listen()
  }

  private onInitialize(params: InitializeParams): InitializeResult {
    const partial = params.initializationOptions as Partial<CommentConfig> | undefined
    this.config = resolveConfig(partial)
    this.refreshLLM()
    try {
      const stores = buildStores(loadKnowledge())
      this.stores = stores
      logger.info(`知识库加载完成：${stores.instructions.getAllMnemonics().length} 条指令`)
    } catch (e) {
      logger.error(`知识库加载失败: ${String(e)}`)
      throw new ResponseError(NASMLanguageServer.ERR_INTERNAL, `NASM Commenter 知识库加载失败: ${String(e)}`)
    }
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        codeActionProvider: true
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

  private async annotate(text: string, config: CommentConfig, range?: { startLine: number; endLine: number }): Promise<{ edits: AnnotateFileResponse['edits']; abi: ReturnType<typeof detectABI>; stats: AnnotateFileResponse['stats'] }> {
    const ann = await annotateSourceEnhanced(text, this.requireStores(), config, this.llm, range)
    const edits = buildEdits(ann.lines, ann.comments, config)
    return { edits, abi: ann.abi, stats: ann.stats }
  }

  private async onAnnotateFile(params: AnnotateFileRequest): Promise<AnnotateFileResponse> {
    const doc = this.requireDoc(params.textDocument.uri)
    const config = resolveConfig({ ...this.config, ...params.config })
    const result = await this.annotate(doc.getText(), config)
    this.pushStats(doc.uri, result.abi, result.stats)
    return result
  }

  private async onAnnotateSelection(params: AnnotateSelectionRequest): Promise<AnnotateFileResponse> {
    const doc = this.requireDoc(params.textDocument.uri)
    const config = resolveConfig({ ...this.config, ...params.config })
    const result = await this.annotate(doc.getText(), config, {
      startLine: params.startLine,
      endLine: params.endLine
    })
    this.pushStats(doc.uri, result.abi, result.stats)
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

  private onRemoveComments(params: RemoveCommentsRequest): RemoveCommentsResponse {
    const doc = this.requireDoc(params.textDocument.uri)
    const lines = doc.getText().split(/\r?\n/)
    const edits = []
    for (let i = 0; i < lines.length; i++) {
      edits.push(...buildRemoveEdits(lines[i], i))
    }
    return { edits, count: edits.length }
  }

  private pushStats(uri: string, abi: ReturnType<typeof detectABI>, stats: AnnotateFileResponse['stats']): void {
    const notification: StatsNotificationParams = { uri, abi, stats }
    void this.connection.sendNotification('nasm-commenter/stats', notification)
  }
}
