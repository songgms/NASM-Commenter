/**
 * 「注释选中区域」命令。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import { requireNasmEditor, annotateRange } from './common'

export async function annotateSelection(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!requireNasmEditor(editor)) {
    return
  }
  const selection = editor.selection
  const startLine = Math.min(selection.start.line, selection.end.line)
  const endLine = Math.max(selection.start.line, selection.end.line)
  await annotateRange(client, editor, startLine, endLine)
}
