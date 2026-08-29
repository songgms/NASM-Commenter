/**
 * Code Action：对指令行提供「添加注释」，对含自动注释的行提供「移除自动注释」，
 * 对多行选区提供「注释选中区域」。
 * 返回纯数据结构（server 端无 vscode 依赖）。
 */
import type { Command } from 'vscode-languageserver/node'
import { parseLine } from '../lexer'
import { findCommentStart } from '../utils/indent'
import { AUTO_MARKER } from '../engine/comment-formatter'

/** 单个 CodeAction（纯数据）。 */
export interface CodeActionData {
  title: string
  command: Command
}

/** @param lineText 光标所在行原始文本 @param multiLine 是否存在多行选区 */
export function provideCodeActions(lineText: string, multiLine: boolean): CodeActionData[] {
  const actions: CodeActionData[] = []
  const parsed = parseLine(lineText, 0)
  const hasComment = findCommentStart(lineText) >= 0
  const hasAuto = lineText.includes(AUTO_MARKER)

  if (hasAuto) {
    actions.push({
      title: '移除 NASM 自动注释',
      command: { title: '移除 NASM 自动注释', command: 'nasm-commenter.removeComments' }
    })
    return actions
  }

  if (parsed.kind === 'instruction' && !hasComment) {
    actions.push({
      title: '添加 NASM 注释',
      command: { title: '添加 NASM 注释', command: 'nasm-commenter.annotateLine' }
    })
  }
  if (multiLine) {
    actions.push({
      title: '注释选中区域',
      command: { title: '注释选中区域', command: 'nasm-commenter.annotateSelection' }
    })
  }
  return actions
}
