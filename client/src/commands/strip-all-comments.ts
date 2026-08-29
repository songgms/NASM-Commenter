/**
 * 「去掉所有注释」命令：移除文件内全部注释（含手写注释）。
 * 需二次确认（不可撤销提示由编辑器撤销栈兜底，但动作本身破坏性强）。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import type { StripAllCommentsResponse } from '../../../server/src/types'
import { requireNasmEditor } from './common'
import { applyAnnotatedEdits } from '../utils/edit-applier'
import { flashStatus } from '../status-bar'
import { log } from '../output-channel'

export async function stripAllComments(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!requireNasmEditor(editor)) {
    return
  }
  const choice = await vscode.window.showWarningMessage(
    '确定去掉本文件的全部注释吗（含手写注释）？',
    { modal: true },
    '去掉全部注释'
  )
  if (choice !== '去掉全部注释') {
    return
  }
  const version = editor.document.version
  const result = await client.sendRequest<StripAllCommentsResponse>('nasm-commenter/stripAllComments', {
    textDocument: { uri: editor.document.uri.toString() }
  })
  const applied = await applyAnnotatedEdits(editor, result.edits, version)
  log(`stripAllComments: ${applied} edits`)
  flashStatus(applied > 0 ? `已去掉 ${applied} 处注释` : '文件中没有注释')
}
