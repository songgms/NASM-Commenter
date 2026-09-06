/**
 * 清空 LLM 缓存命令。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import { log } from '../output-channel'

export async function clearLlmCache(client: LanguageClient): Promise<void> {
  await client.sendRequest('nasm-commenter/clearLlmCache', {})
  log('LLM 缓存已清空')
  void vscode.window.showInformationMessage('LLM 缓存已清空')
}
