/**
 * 编辑应用：将 server 返回的 AnnotatedEdit 应用到编辑器（含版本冲突检查）。
 */
import * as vscode from 'vscode'
import type { AnnotatedEdit } from '../../../server/src/types'

/**
 * 应用编辑列表。requestVersion 为请求发出时的文档版本，
 * 若应用时版本已变化则放弃（避免覆盖用户输入）。
 * @returns 实际应用的编辑数
 */
export async function applyAnnotatedEdits(
  editor: vscode.TextEditor,
  edits: AnnotatedEdit[],
  requestVersion: number
): Promise<number> {
  if (edits.length === 0) {
    return 0
  }
  if (editor.document.version !== requestVersion) {
    void vscode.window.showWarningMessage('文件在注释生成期间被修改，已取消应用注释')
    return 0
  }
  const workspaceEdit = new vscode.WorkspaceEdit()
  for (const edit of edits) {
    const endLine = editor.document.lineAt(Math.min(edit.endLine, editor.document.lineCount - 1))
    const endChar = Math.min(edit.endCharacter, endLine.text.length)
    workspaceEdit.replace(
      editor.document.uri,
      new vscode.Range(
        new vscode.Position(edit.startLine, edit.startCharacter),
        new vscode.Position(edit.endLine, endChar)
      ),
      edit.newText
    )
  }
  const ok = await vscode.workspace.applyEdit(workspaceEdit)
  return ok ? edits.length : 0
}
