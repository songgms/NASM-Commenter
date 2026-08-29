/**
 * 「切换虚拟注释」命令：开关 Inlay Hint 幽灵文字预览。
 */
import * as vscode from 'vscode'

export async function toggleVirtual(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('nasm-commenter')
  const current = cfg.get<boolean>('virtual', true)
  const next = !current
  const target = vscode.workspace.workspaceFolders !== undefined
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global
  await cfg.update('virtual', next, target)
  void vscode.window.showInformationMessage(next ? '虚拟注释预览已开启' : '虚拟注释预览已关闭')
}
