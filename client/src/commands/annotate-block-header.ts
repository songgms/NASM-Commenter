/**
 * 「为选中区域生成头部说明注释」命令：
 * 在选区上方插入块头注释（行数汇总），与逐行注释互补。
 */
import * as vscode from 'vscode'

export async function annotateBlockHeader(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (editor === undefined || editor.document.languageId !== 'nasm') {
    void vscode.window.showWarningMessage('当前文件不是 NASM 汇编文件')
    return
  }
  const selection = editor.selection
  const startLine = Math.min(selection.start.line, selection.end.line)
  const endLine = Math.max(selection.start.line, selection.end.line)
  if (startLine === endLine) {
    void vscode.window.showInformationMessage('请选中多行代码后再生成块头注释')
    return
  }
  const lineCount = endLine - startLine + 1
  const indentMatch = /^[ \t]*/.exec(editor.document.lineAt(startLine).text)
  const indent = indentMatch ? indentMatch[0] : ''
  const edit = new vscode.WorkspaceEdit()
  edit.insert(
    editor.document.uri,
    new vscode.Position(startLine, 0),
    `${indent}; ===== 代码块说明 (${lineCount} 行) =====\n`
  )
  const ok = await vscode.workspace.applyEdit(edit)
  if (ok) {
    void vscode.window.setStatusBarMessage(`已在第 ${startLine + 1} 行插入块头注释`, 3000)
  }
}
