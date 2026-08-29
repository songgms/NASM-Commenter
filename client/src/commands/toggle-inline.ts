/**
 * 「切换行内/上方注释」命令。
 */
import * as vscode from 'vscode'

export async function toggleInline(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('nasm-commenter')
  const current = cfg.get<'inline' | 'above'>('style', 'inline')
  const next = current === 'inline' ? 'above' : 'inline'
  const target = vscode.workspace.workspaceFolders !== undefined
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global
  await cfg.update('style', next, target)
  void vscode.window.showInformationMessage(next === 'inline' ? '注释样式已切换为行内' : '注释样式已切换为行上方')
}
