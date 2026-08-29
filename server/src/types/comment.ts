/**
 * 注释结果与格式化类型定义（零运行时依赖，仅类型）。
 */

/** 注释来源。 */
export type CommentSource = 'rule' | 'pattern' | 'context' | 'llm' | 'fallback'

/** 注释样式：行内（inline）或行上方（above）。 */
export type CommentStyle = 'inline' | 'above'

/** 注释语言。 */
export type CommentLanguage = 'zh' | 'en'

/** 单行注释生成结果。 */
export interface CommentResult {
  /** 中文注释文本（不含分号与标记） */
  comment: string
  /** 英文注释文本（可选） */
  commentEn?: string
  /** 置信度 0-1：规则引擎固定 1.0 */
  confidence: number
  source: CommentSource
  /** 详细模式（verbose）附加说明 */
  detail?: string
  /** 该行被跳过（空行/纯注释/已有注释等） */
  skipped?: boolean
  /** 跳过原因 */
  skipReason?: string
}

/** 模板渲染变量。 */
export interface TemplateVariables {
  /** 目标操作数 */
  dst?: string
  /** 源操作数 */
  src?: string
  /** 立即数（保留原始格式） */
  imm?: string
  /** 内存地址表达式 */
  mem?: string
  /** 标签名 */
  label?: string
  /** 寄存器名 */
  reg?: string
  /** 系统调用名 */
  syscall?: string
  /** 重复次数（rep 前缀 / times） */
  count?: string
  /** 操作数大小 */
  size?: string
  /** 上下文变量：寄存器名 → 已知值描述（{ctx:reg:rax} 取用） */
  ctx?: Record<string, string>
}

/** 注释格式化选项。 */
export interface FormatOptions {
  style: CommentStyle
  language: CommentLanguage
  /** 行内注释最小对齐列 */
  minColumn: number
  tabSize: number
  /** 自动注释标记，默认 `[nasm-commenter] ` */
  marker: string
  /** 详细模式：附加 detail 说明 */
  verbose: boolean
}

/** 格式化后的注释（编辑器插入单元）。 */
export interface FormattedComment {
  /** 完整插入文本（含分号、标记；inline 追加场景含替换全文；above 模式含结尾换行） */
  text: string
  /** 插入行（0-based） */
  insertLine: number
  /** 插入列（0-based；above 模式为 0） */
  insertColumn: number
  /** 是否为新行插入（above 模式） */
  isNewline: boolean
  /** 行内替换场景的排他结束列（覆盖已有注释到行尾）；纯插入时为 undefined */
  replaceEnd?: number
}

/**
 * 注释编辑：LSP 层传输的最小编辑单元。
 * start == end 表示纯插入；否则为范围替换（移除注释场景）。
 */
export interface AnnotatedEdit {
  startLine: number
  startCharacter: number
  /** 排他结束位置；插入编辑与 start 相同 */
  endLine: number
  endCharacter: number
  newText: string
}

/** 注释统计（状态栏展示）。 */
export interface CommentStats {
  totalLines: number
  commentedLines: number
  skippedLines: number
  bySource: Record<CommentSource, number>
}
