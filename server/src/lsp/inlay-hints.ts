/**
 * 虚拟注释（预览）：以 Inlay Hint 幽灵文本形式在行尾展示注释，不修改文档。
 * 已有真实注释的行不再重复预览。
 */
import type { ParsedLine, CommentResult } from '../types'
import type { KnowledgeStores } from '../knowledge'
import { stripExistingComment } from '../utils/indent'
import { instructionHover } from './hover'

/** 单条虚拟注释（纯数据，server 层转换为 LSP InlayHint）。 */
export interface VirtualComment {
  line: number
  character: number
  /** 展示文本（含 `; ` 前缀） */
  label: string
  /** 悬停说明（Markdown，指令语义） */
  tooltip?: string
}

/**
 * 从注释生成结果构建虚拟注释列表。
 * 跳过：空行/纯注释行、引擎跳过的行、已有真实注释的行（避免重复）。
 */
export function provideVirtualComments(
  lines: ParsedLine[],
  comments: Map<number, CommentResult>,
  stores: KnowledgeStores
): VirtualComment[] {
  const hints: VirtualComment[] = []
  for (const line of lines) {
    const result = comments.get(line.lineNumber)
    if (result === undefined || result.skipped === true || result.comment.length === 0) {
      continue
    }
    if (line.comment !== undefined && line.comment.length > 0) {
      continue // 已有真实注释，不重复预览
    }
    const codeLen = stripExistingComment(line.raw).trimEnd().length
    const tooltip =
      line.mnemonic !== undefined ? instructionHover(line.mnemonic, stores) ?? undefined : undefined
    hints.push({
      line: line.lineNumber,
      character: codeLen,
      label: `; ${result.comment}`,
      tooltip
    })
  }
  return hints
}
