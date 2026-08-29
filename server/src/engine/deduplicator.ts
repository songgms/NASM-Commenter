/**
 * 去重与移除：识别既有自动注释并支持幂等生成。
 *
 * 两种模式：
 * - 默认（marker 为空）：按「行内注释内容与当前生成结果一致」判定；移除由 server
 *   基于生成结果构造（见 server.ts onRemoveComments）。
 * - 标记模式（配置 marker，如 `[nasm-commenter] `）：注释携带标记，支持精确扫描移除。
 */
import type { AnnotatedEdit } from '../types'
import { findCommentStart } from '../utils/indent'

/**
 * 提取行内注释文本（字符串中的分号不算；不含 `;` 本身）。
 */
export function existingComment(line: string): string {
  const idx = findCommentStart(line)
  return idx < 0 ? '' : line.slice(idx + 1).trim()
}

/**
 * 如果行内已有内容相同的注释（或 `旧注释 / 新注释` 追加形式），返回 true（跳过重复生成）。
 * marker 模式下按「标记后内容一致」判定。
 */
export function shouldSkip(line: string, generatedComment: string, marker = ''): boolean {
  const gen = generatedComment.trim()
  if (gen.length === 0) {
    return false
  }
  const existing = existingComment(line)
  if (existing.length === 0) {
    return false
  }
  if (marker.length > 0) {
    const at = existing.indexOf(marker)
    return at >= 0 && existing.slice(at + marker.length).trim() === gen
  }
  return existing === gen || existing.endsWith(` / ${gen}`)
}

/**
 * 将 AnnotatedEdit 应用到多行文本（与客户端 WorkspaceEdit.replace 行为一致）。
 * 支持跨行范围（endLine > startLine，如整行删除）；按行后序应用避免索引漂移。
 */
export function applyEditsToText(text: string, edits: AnnotatedEdit[]): string {
  const lines = text.split(/\r?\n/)
  const sorted = [...edits].sort(
    (a, b) => b.startLine - a.startLine || b.startCharacter - a.startCharacter
  )
  for (const e of sorted) {
    const startLineText = lines[e.startLine] ?? ''
    if (e.startLine === e.endLine) {
      if (e.startCharacter === e.endCharacter) {
        lines[e.startLine] = startLineText.slice(0, e.startCharacter) + e.newText + startLineText.slice(e.startCharacter)
      } else {
        lines[e.startLine] = startLineText.slice(0, e.startCharacter) + e.newText + startLineText.slice(e.endCharacter)
      }
      continue
    }
    // 跨行：合并首尾行为一行
    const endLineText = lines[e.endLine] ?? ''
    const merged =
      startLineText.slice(0, e.startCharacter) + e.newText + endLineText.slice(e.endCharacter)
    lines.splice(e.startLine, e.endLine - e.startLine + 1, merged)
  }
  return lines.join('\n')
}

/**
 * 标记模式下的移除编辑（按 marker 扫描，精确）：
 * - 纯自动注释 → 移除整个注释（含 `; ` 与对齐空白）
 * - 用户注释后追加的自动注释 → 只移除追加部分
 * marker 为空时返回空数组（内容匹配模式由 server 基于生成结果构造）。
 */
export function buildRemoveEdits(line: string, lineNumber: number, marker = ''): AnnotatedEdit[] {
  if (marker.length === 0) {
    return []
  }
  const idx = findCommentStart(line)
  if (idx < 0) {
    return []
  }
  const commentStart = idx + 1
  const markerAt = line.indexOf(marker, commentStart)
  if (markerAt < 0) {
    return []
  }
  const userPart = line.slice(commentStart, markerAt).trim()
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
