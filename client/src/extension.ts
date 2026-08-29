/**
 * 扩展入口：启动 LSP 客户端、注册命令、状态栏与配置同步。
 */
import * as path from 'path'
import * as vscode from 'vscode'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node'
import { registerCommands } from './commands'
import { createStatusBar } from './status-bar'
import { getConfig, onConfigChange } from './config'
import { createOutputChannel, log } from './output-channel'

let client: LanguageClient

export function activate(context: vscode.ExtensionContext): void {
  createOutputChannel(context)
  const config = getConfig()
  if (!config.enable) {
    log('扩展已在设置中禁用（nasm-commenter.enable = false）')
    return
  }

  const serverModule = context.asAbsolutePath(path.join('dist', 'server', 'index.js'))
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'nasm' }],
    synchronize: { configurationSection: 'nasm-commenter' },
    initializationOptions: config,
    outputChannelName: 'NASM Commenter Server'
  }
  client = new LanguageClient('nasm-commenter', 'NASM Commenter', serverOptions, clientOptions)
  log('正在启动语言服务器...')
  void client.start().then(() => {
    log('语言服务器已就绪')
    // 初始配置同步
    void client.sendNotification('nasm-commenter/configDidChange', { config: getConfig() })
  })

  registerCommands(context, client)
  createStatusBar(context, client)
  onConfigChange(context, (next) => {
    if (client.isRunning()) {
      void client.sendNotification('nasm-commenter/configDidChange', { config: next })
      log('配置已同步到服务器')
    }
  })

  // 保存时自动注释（可选）
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const current = getConfig()
      if (current.autoAnnotate && doc.languageId === 'nasm') {
        void vscode.commands.executeCommand('nasm-commenter.annotateFile')
      }
    })
  )
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
