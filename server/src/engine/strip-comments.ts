/**
 * 去掉所有注释：移除文件内全部注释（含手写注释）。
 * - 整行注释 → 删除整行
 * - 行尾注释 → 剥离注释与其前导空白
 * - 字符串中的 `;` 不受影响
 */
import type { AnnotatedEdit } from '../types'
import { findCommentStart } from '../utils/indent'

/** 移除全部注释，返回编辑列表。 */
export function stripAllCommentsEdits(text: string): AnnotatedEdit[] {
  const lines = text.split(/\r?\n/)
  const edits: AnnotatedEdit[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const idx = findCommentStart(line)
    if (idx < 0) {
      continue
    }
    const code = line.slice(0, idx).trimEnd()
    if (code.length === 0) {
      // 整行注释：删除整行（含换行；末行只清空内容）
      const isLast = i === lines.length - 1
      edits.push({
        startLine: i,
        startCharacter: 0,
        endLine: isLast ? i : i + 1,
        endCharacter: isLast ? line.length : 0,
        newText: ''
      })
      continue
    }
    // 行尾注释：剥离注释与前导空白
    edits.push({
      startLine: i,
      startCharacter: code.length,
      endLine: i,
      endCharacter: line.length,
      newText: ''
    })
  }
  return edits
}
