/**
 * 状态栏：显示注释统计与 ABI 检测结果。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import type { StatsNotificationParams } from '../../server/src/types'

let item: vscode.StatusBarItem | null = null
const lastStats = new Map<string, StatsNotificationParams>()

/** 创建状态栏并订阅 server 统计通知。 */
export function createStatusBar(context: vscode.ExtensionContext, client: LanguageClient): vscode.StatusBarItem {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  item.command = 'nasm-commenter.annotateFile'
  item.text = '$(comment) NASM'
  context.subscriptions.push(
    item,
    client.onNotification('nasm-commenter/stats', (params: StatsNotificationParams) => {
      lastStats.set(params.uri, params)
      updateForEditor(vscode.window.activeTextEditor)
    })
  )

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => updateForEditor(editor))
  )
  updateForEditor(vscode.window.activeTextEditor)
  return item
}

function updateForEditor(editor: vscode.TextEditor | undefined): void {
  if (item === null) {
    return
  }
  if (editor === undefined || editor.document.languageId !== 'nasm') {
    item.hide()
    return
  }
  const stats = lastStats.get(editor.document.uri.toString())
  if (stats === undefined) {
    item.text = '$(comment) NASM'
  } else {
    const abiLabel = stats.abi === 'linux-x86' ? 'x86' : stats.abi === 'macos-x64' ? 'macOS' : 'x64'
    item.text = `$(comment) ${stats.stats.commentedLines}/${stats.stats.totalLines} · ${abiLabel}`
    item.tooltip = `NASM Commenter: 自动注释覆盖 ${stats.stats.commentedLines}/${stats.stats.totalLines} 行 (ABI: ${stats.abi})`
  }
  item.show()
}

/** 短暂显示一条操作结果。 */
export function flashStatus(message: string): void {
  void vscode.window.setStatusBarMessage(message, 3000)
}
