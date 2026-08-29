/**
 * Code Action：对指令行提供「添加注释」，对含自动注释的行提供「移除自动注释」，
 * 对多行选区提供「注释选中区域」。
 * 返回纯数据结构（server 端无 vscode 依赖）。
 */
import type { Command } from 'vscode-languageserver/node'
import { parseLine } from '../lexer'
import { findCommentStart } from '../utils/indent'

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

  if (hasComment) {
    actions.push({
      title: '移除自动注释',
      command: { title: '移除自动注释', command: 'nasm-commenter.removeComments' }
    })
    actions.push({
      title: '去掉所有注释（含手写）',
      command: { title: '去掉所有注释（含手写）', command: 'nasm-commenter.stripAllComments' }
    })
    return actions
  }

  if (parsed.kind === 'instruction' && !hasComment) {
    actions.push({
      title: '添加 NASM 注释',
      command: { title: '添加 NASM 注释', command: 'nasm-commenter.annotateLine' }
    })
    actions.push({
      title: '为当前函数生成块注释',
      command: { title: '为当前函数生成块注释', command: 'nasm-commenter.annotateFunction' }
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
