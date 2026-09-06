/**
 * 客户端配置读取与变更监听。
 */
import * as vscode from 'vscode'
import type { CommentConfig, LLMProvider } from '../../server/src/types'

/** 从工作区设置读取完整配置。 */
export function getConfig(): CommentConfig {
  const cfg = vscode.workspace.getConfiguration('nasm-commenter')
  const llmProvider = cfg.get<string>('llm.provider', 'openai') as LLMProvider
  return {
    enable: cfg.get<boolean>('enable', true),
    virtual: cfg.get<boolean>('virtual', true),
    format: { enable: cfg.get<boolean>('format.enable', false) },
    language: cfg.get<'zh' | 'en'>('language', 'zh'),
    style: cfg.get<'inline' | 'above'>('style', 'inline'),
    minColumn: cfg.get<number>('minColumn', 32),
    verbose: cfg.get<boolean>('verbose', false),
    autoAnnotate: cfg.get<boolean>('autoAnnotate', false),
    protectExistingComments: cfg.get<boolean>('protectExistingComments', true),
    marker: cfg.get<string>('marker', ''),
    abi: 'auto',
    llm: {
      enabled: cfg.get<boolean>('llm.enabled', false),
      provider: llmProvider,
      apiKey: cfg.get<string>('llm.apiKey', ''),
      model: cfg.get<string>('llm.model', 'gpt-4o-mini'),
      baseUrl: cfg.get<string>('llm.baseUrl', 'https://api.openai.com/v1'),
      timeout: cfg.get<number>('llm.timeout', 30000),
      cache: cfg.get<boolean>('llm.cache', true)
    }
  }
}

/** 监听配置变更（回调拿到最新配置）。 */
export function onConfigChange(context: vscode.ExtensionContext, callback: (config: CommentConfig) => void): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('nasm-commenter')) {
        callback(getConfig())
      }
    })
  )
}
