/**
 * 「注释当前函数」命令：生成函数块注释（函数名/功能/参数/返回/破坏的寄存器）。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import type { AnnotateFunctionResponse } from '../../../server/src/types'
import { requireNasmEditor } from './common'
import { applyAnnotatedEdits } from '../utils/edit-applier'
import { flashStatus } from '../status-bar'
import { log } from '../output-channel'

export async function annotateFunction(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!requireNasmEditor(editor)) {
    return
  }
  const line = editor.selection.active.line
  const version = editor.document.version
  const result = await client.sendRequest<AnnotateFunctionResponse | null>('nasm-commenter/annotateFunction', {
    textDocument: { uri: editor.document.uri.toString() },
    line
  })
  if (result === null) {
    void vscode.window.showInformationMessage('未找到函数（需要函数入口标签，如 global 导出或 _start）')
    return
  }
  const applied = await applyAnnotatedEdits(editor, result.edits, version)
  log(`annotateFunction ${result.functionName}: confidence=${result.confidence}`)
  flashStatus(applied > 0 ? `已为函数 ${result.functionName} 生成块注释` : '函数已有注释，未修改')
}
