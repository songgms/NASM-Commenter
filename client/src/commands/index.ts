/**
 * 命令注册中心：统一注册所有命令。
 */
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import { annotateFile } from './annotate-file'
import { annotateSelection } from './annotate-selection'
import { annotateLine } from './annotate-line'
import { annotateFunction } from './annotate-function'
import { removeComments } from './remove-comments'
import { stripAllComments } from './strip-all-comments'
import { toggleInline } from './toggle-inline'
import { toggleVirtual } from './toggle-virtual'

export function registerCommands(context: vscode.ExtensionContext, client: LanguageClient): void {
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('nasm-commenter.annotateFile', () => annotateFile(client)),
    vscode.commands.registerTextEditorCommand('nasm-commenter.annotateSelection', () => annotateSelection(client)),
    vscode.commands.registerTextEditorCommand('nasm-commenter.annotateLine', () => annotateLine(client)),
    vscode.commands.registerTextEditorCommand('nasm-commenter.annotateFunction', () => annotateFunction(client)),
    vscode.commands.registerTextEditorCommand('nasm-commenter.removeComments', () => removeComments(client)),
    vscode.commands.registerTextEditorCommand('nasm-commenter.stripAllComments', () => stripAllComments(client)),
    vscode.commands.registerCommand('nasm-commenter.toggleInline', () => toggleInline()),
    vscode.commands.registerCommand('nasm-commenter.toggleVirtual', () => toggleVirtual())
  )
}
