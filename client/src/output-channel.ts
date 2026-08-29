/**
 * 输出面板：客户端调试日志与 LLM 请求记录。
 */
import * as vscode from 'vscode'

let channel: vscode.OutputChannel | null = null

/** 创建（或复用）输出通道。 */
export function createOutputChannel(context: vscode.ExtensionContext): vscode.OutputChannel {
  if (channel === null) {
    channel = vscode.window.createOutputChannel('NASM Commenter')
    context.subscriptions.push(channel)
  }
  return channel
}

/** 获取输出通道（未创建时返回 null）。 */
export function getOutputChannel(): vscode.OutputChannel | null {
  return channel
}

/** 追加一行日志到输出面板。 */
export function log(message: string): void {
  channel?.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`)
}
