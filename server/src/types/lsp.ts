/**
 * LSP 自定义请求/响应类型定义（零运行时依赖，仅类型）。
 */
import type { ABI } from './knowledge'
import type { AnnotatedEdit, CommentStats } from './comment'
import type { CommentConfig } from './config'

/** 自定义 LSP 方法名。 */
export type NasmCommenterMethod =
  | 'nasm-commenter/annotateFile'
  | 'nasm-commenter/annotateSelection'
  | 'nasm-commenter/annotateFunction'
  | 'nasm-commenter/removeComments'
  | 'nasm-commenter/configDidChange'
  | 'nasm-commenter/stats'

/** 文档引用（与 LSP TextDocumentIdentifier 结构一致，避免依赖运行时包）。 */
export interface DocumentRef {
  uri: string
}

/** annotateFile 请求：整个文档生成注释。 */
export interface AnnotateFileRequest {
  textDocument: DocumentRef
  /** 客户端当前配置（覆盖初始化配置） */
  config?: Partial<CommentConfig>
}

/** annotateFile 响应。 */
export interface AnnotateFileResponse {
  edits: AnnotatedEdit[]
  abi: ABI
  stats: CommentStats
}

/** annotateSelection 请求：指定行范围（0-based，inclusive）。 */
export interface AnnotateSelectionRequest extends AnnotateFileRequest {
  startLine: number
  endLine: number
}

/** annotateFunction 请求：光标所在函数生成块注释。 */
export interface AnnotateFunctionRequest {
  textDocument: DocumentRef
  /** 光标行（0-based） */
  line: number
}

/** annotateFunction 响应。 */
export interface AnnotateFunctionResponse {
  functionName: string
  functionStartLine: number
  /** 块注释文本（不含分号前缀，多行以 \n 分隔） */
  blockComment: string
  /** 上方插入编辑 */
  edits: AnnotatedEdit[]
  confidence: number
}

/** removeComments 请求：移除所有 [nasm-commenter] 标记注释。 */
export interface RemoveCommentsRequest {
  textDocument: DocumentRef
}

/** removeComments 响应。 */
export interface RemoveCommentsResponse {
  edits: AnnotatedEdit[]
  count: number
}

/** configDidChange 通知参数：全量配置。 */
export interface ConfigDidChangeParams {
  config: CommentConfig
}

/** stats 通知参数（server → client，状态栏展示）。 */
export interface StatsNotificationParams {
  uri: string
  abi: ABI
  stats: CommentStats
}
