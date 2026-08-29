/**
 * 注释格式化器：将注释文本转换为编辑器插入单元（行内 / 行上方）。
 *
 * 行内模式插入列 = 代码末尾；对齐通过 newText 前导空格实现
 * （直接在超出行尾的列插入会被编辑器截断，因此不那样做）。
 */
import type { CommentResult, FormatOptions, FormattedComment, ParsedLine } from '../types'
import { findCommentStart, stripExistingComment } from '../utils/indent'

/** 自动注释标记（不含尾随空格）。 */
export const AUTO_MARKER = '[nasm-commenter]'

/** 默认标记（含尾随空格）。 */
export const DEFAULT_MARKER = '[nasm-commenter] '

/** 计算范围内行内注释的对齐列：max(minColumn, 最长代码 + 2)。 */
export function alignColumn(codeLines: string[], minColumn: number): number {
  let maxLen = 0
  for (const line of codeLines) {
    const code = stripExistingComment(line).trimEnd()
    if (code.length > maxLen) {
      maxLen = code.length
    }
  }
  return Math.max(minColumn, maxLen + 2)
}

/** 组装注释正文（含 verbose 附加说明）。 */
function composeText(result: CommentResult, options: FormatOptions): string {
  const main = options.language === 'en' && result.commentEn ? result.commentEn : result.comment
  if (options.verbose && result.detail) {
    return `${main}（${result.detail}）`
  }
  return main
}

/**
 * 格式化单行注释。
 * - inline（无已有注释）：在代码末尾插入 `padding; [nasm-commenter] 内容`
 * - inline（已有用户注释且不保护）：替换整段注释为 `; 用户注释 [nasm-commenter] 新注释`
 * - above：在行首插入整行 `{indent}; [nasm-commenter] 内容\n`
 */
export function formatComment(
  line: ParsedLine,
  result: CommentResult,
  options: FormatOptions,
  alignColumnValue?: number
): FormattedComment {
  const body = composeText(result, options)
  const marked = `${options.marker}${body}`

  if (options.style === 'above') {
    const indent = line.indent ?? ''
    return {
      text: `${indent}; ${marked}\n`,
      insertLine: line.lineNumber,
      insertColumn: 0,
      isNewline: true
    }
  }

  const code = stripExistingComment(line.raw).trimEnd()
  const codeLen = code.length

  // 已有用户注释（保护关闭时才会走到这里）：替换从注释开始到行尾
  if (line.comment !== undefined && line.comment.length > 0) {
    const commentStart = findCommentStart(line.raw)
    return {
      text: `; ${line.comment.trim()} ${marked}`,
      insertLine: line.lineNumber,
      insertColumn: commentStart >= 0 ? commentStart : codeLen,
      isNewline: false,
      replaceEnd: line.raw.length
    }
  }

  const target = alignColumnValue ?? options.minColumn
  const padding = ' '.repeat(Math.max(2, target - codeLen))
  return {
    text: `${padding}; ${marked}`,
    insertLine: line.lineNumber,
    insertColumn: codeLen,
    isNewline: false
  }
}

/** 将 FormattedComment 转为 AnnotatedEdit。 */
export function toEdit(formatted: FormattedComment): {
  startLine: number
  startCharacter: number
  endLine: number
  endCharacter: number
  newText: string
} {
  return {
    startLine: formatted.insertLine,
    startCharacter: formatted.insertColumn,
    endLine: formatted.insertLine,
    endCharacter: formatted.replaceEnd ?? formatted.insertColumn,
    newText: formatted.text
  }
}
