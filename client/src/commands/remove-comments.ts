/**
 * 「移除自动注释」命令：只移除 [nasm-commenter] 标记的注释，用户手写注释不受影响。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import type { RemoveCommentsResponse } from '../../../server/src/types'
import { requireNasmEditor } from './common'
import { applyAnnotatedEdits } from '../utils/edit-applier'
import { flashStatus } from '../status-bar'
import { log } from '../output-channel'

export async function removeComments(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!requireNasmEditor(editor)) {
    return
  }
  const version = editor.document.version
  const result = await client.sendRequest<RemoveCommentsResponse>('nasm-commenter/removeComments', {
    textDocument: { uri: editor.document.uri.toString() }
  })
  const applied = await applyAnnotatedEdits(editor, result.edits, version)
  log(`removeComments: ${applied} edits`)
  flashStatus(applied > 0 ? `已移除 ${applied} 处自动注释` : '没有自动注释')
}
