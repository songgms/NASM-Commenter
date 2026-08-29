/**
 * 「注释整个文件」命令。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import type { AnnotateFileResponse } from '../../../server/src/types'
import { requireNasmEditor } from './common'
import { applyAnnotatedEdits } from '../utils/edit-applier'
import { flashStatus } from '../status-bar'
import { log } from '../output-channel'

export async function annotateFile(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!requireNasmEditor(editor)) {
    return
  }
  const version = editor.document.version
  const result = await client.sendRequest<AnnotateFileResponse>('nasm-commenter/annotateFile', {
    textDocument: { uri: editor.document.uri.toString() }
  })
  const applied = await applyAnnotatedEdits(editor, result.edits, version)
  log(`annotateFile: applied ${applied} edits (abi=${result.abi})`)
  flashStatus(applied > 0 ? `已注释 ${applied} 行` : '没有需要注释的行')
}
