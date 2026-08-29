/**
 * 「注释当前行」命令（快捷键 Ctrl+;）。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import { requireNasmEditor, annotateRange } from './common'

export async function annotateLine(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!requireNasmEditor(editor)) {
    return
  }
  const line = editor.selection.active.line
  await annotateRange(client, editor, line, line)
}
