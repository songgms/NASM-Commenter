/**
 * 「跳转到第一个未注释行」命令。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import { requireNasmEditor } from './common'

export async function gotoFirstUnannotated(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!requireNasmEditor(editor)) {
    return
  }
  const result = await client.sendRequest<{ line: number } | null>('nasm-commenter/firstUnannotated', {
    textDocument: { uri: editor.document.uri.toString() }
  })
  if (result === null) {
    void vscode.window.showInformationMessage('所有指令行均已注释')
    return
  }
  const pos = new vscode.Position(result.line, 0)
  editor.selection = new vscode.Selection(pos, pos)
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter)
}
