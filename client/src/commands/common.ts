/**
 * 命令共享工具：NASM 编辑器校验与注释请求 → 编辑应用管线。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import type { AnnotateFileResponse } from '../../../server/src/types'
import { applyAnnotatedEdits } from '../utils/edit-applier'
import { flashStatus } from '../status-bar'
import { log } from '../output-channel'

/** 校验当前活动编辑器是 NASM 文件；不是则提示并返回 false。 */
export function requireNasmEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
  if (editor === undefined) {
    return false
  }
  if (editor.document.languageId !== 'nasm') {
    void vscode.window.showWarningMessage('当前文件不是 NASM 汇编文件')
    return false
  }
  return true
}

/** 请求注释指定行范围并应用编辑。 */
export async function annotateRange(
  client: LanguageClient,
  editor: vscode.TextEditor,
  startLine: number,
  endLine: number
): Promise<void> {
  const version = editor.document.version
  const result = await client.sendRequest<AnnotateFileResponse>('nasm-commenter/annotateSelection', {
    textDocument: { uri: editor.document.uri.toString() },
    startLine,
    endLine
  })
  const applied = await applyAnnotatedEdits(editor, result.edits, version)
  log(`annotateRange ${startLine}-${endLine}: applied ${applied} edits`)
  flashStatus(applied > 0 ? `已注释 ${applied} 行` : '没有需要注释的行')
}
