/**
 * 去重器：识别与移除 [nasm-commenter] 标记的自动注释。
 * 只动带标记的内容，用户手写注释不受影响。
 */
import type { AnnotatedEdit } from '../types'
import { findCommentStart } from '../utils/indent'
import { AUTO_MARKER } from './comment-formatter'

/** 提取行内所有自动注释内容（不含标记本身）。 */
export function extractAutoComments(line: string): string[] {
  const idx = findCommentStart(line)
  if (idx < 0) {
    return []
  }
  const comment = line.slice(idx + 1)
  const results: string[] = []
  const from = 0
  for (;;) {
    const at = comment.indexOf(AUTO_MARKER, from)
    if (at < 0) {
      break
    }
    // 内容延伸到行尾或下一个用户注释边界（此处取到行尾）
    results.push(comment.slice(at + AUTO_MARKER.length).trim())
    break
  }
  return results
}

/**
 * 如果行内已有内容相同的自动注释，返回 true（跳过重复生成）。
 */
export function shouldSkip(line: string, generatedComment: string): boolean {
  const existing = extractAutoComments(line)
  const generated = generatedComment.trim()
  return existing.some((e) => e === generated)
}

/**
 * 统计文本中包含自动注释标记的行数（状态栏覆盖率展示用）。
 */
export function countAutoCommentLines(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.includes(AUTO_MARKER)).length
}

/**
 * 将 AnnotatedEdit 应用到多行文本（与客户端 WorkspaceEdit.replace 行为一致）。
 * 按行后序应用避免索引漂移；server 端用于模拟注释后的文本状态。
 */
export function applyEditsToText(text: string, edits: AnnotatedEdit[]): string {
  const lines = text.split(/\r?\n/)
  const sorted = [...edits].sort(
    (a, b) => b.startLine - a.startLine || b.startCharacter - a.startCharacter
  )
  for (const e of sorted) {
    const line = lines[e.startLine] ?? ''
    if (e.startLine === e.endLine && e.startCharacter === e.endCharacter) {
      lines[e.startLine] = line.slice(0, e.startCharacter) + e.newText + line.slice(e.startCharacter)
    } else {
      lines[e.startLine] = line.slice(0, e.startCharacter) + e.newText + line.slice(e.endCharacter)
    }
  }
  return lines.join('\n')
}

/**
 * 构造移除该行自动注释的编辑：
 * - 纯自动注释 → 移除整个注释（含 `; `）
 * - 用户注释后追加的自动注释 → 只移除 ` [nasm-commenter] ...` 尾部
 * 无自动注释时返回空数组。
 */
export function buildRemoveEdits(line: string, lineNumber: number): AnnotatedEdit[] {
  const idx = findCommentStart(line)
  if (idx < 0) {
    return []
  }
  const commentStart = idx + 1
  const markerAt = line.indexOf(AUTO_MARKER, commentStart)
  if (markerAt < 0) {
    return []
  }
  const beforeMarker = line.slice(commentStart, markerAt)
  const userPart = beforeMarker.trim()
  if (userPart.length === 0) {
    // 整个注释都是自动生成：连 `;` 一起移除，并吃掉注释前的空白
    let start = idx
    while (start > 0 && /[ \t]/.test(line[start - 1])) {
      start--
    }
    return [{
      startLine: lineNumber,
      startCharacter: start,
      endLine: lineNumber,
      endCharacter: line.length,
      newText: ''
    }]
  }
  // 保留用户注释部分，移除追加的自动注释
  return [{
    startLine: lineNumber,
    startCharacter: markerAt,
    endLine: lineNumber,
    endCharacter: line.length,
    newText: ''
  }]
}
