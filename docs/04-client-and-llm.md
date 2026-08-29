# 04 - VSCode 客户端与 LLM 适配器

## 第一部分：VSCode 客户端

### 1. 职责

客户端是 VSCode 扩展宿主中运行的薄编排层：启动 LSP Server、注册命令和 Provider、将编辑应用到编辑器、管理配置。不包含任何注释生成逻辑。

### 2. 文件结构

```
client/src/
├── extension.ts          # 入口 activate/deactivate
├── client.ts             # LanguageClient 创建与管理
├── commands/
│   ├── comment-line.ts
│   ├── comment-range.ts
│   ├── comment-document.ts
│   ├── comment-function.ts
│   ├── remove-comments.ts
│   └── toggle-auto-comment.ts
├── providers/
│   ├── code-action.ts    # CodeActionProvider
│   └── hover.ts          # HoverProvider
├── config.ts             # 配置读取与同步
├── status-bar.ts         # 状态栏显示
└── utils/
    ├── edit-applier.ts   # TextEdit 应用
    └── range-utils.ts
```

### 3. 扩展入口

```typescript
let client: LanguageClient

export async function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'))
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--inspect=6009'] } }
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'nasm' }],
    synchronize: { configurationSection: 'nasm-commenter', fileEvents: workspace.createFileSystemWatcher('**/.asm') },
    initializationOptions: getConfig()
  }
  client = new LanguageClient('nasm-commenter', 'NASM Commenter', serverOptions, clientOptions)
  await client.start()
  registerCommands(context)
  registerProviders(context)
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
```

### 4. 命令注册

| 命令 ID | 快捷键 | 功能 |
|---------|--------|------|
| `nasm-commenter.commentLine` | `Ctrl+;` | 注释当前行 |
| `nasm-commenter.commentRange` | `Ctrl+Shift+;` | 注释选中范围 |
| `nasm-commenter.commentDocument` | — | 注释整个文档 |
| `nasm-commenter.commentFunction` | — | 注释当前函数 |
| `nasm-commenter.removeAutoComments` | — | 移除自动注释 |

```typescript
function registerCommands(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerTextEditorCommand('nasm-commenter.commentLine', commentLine),
    commands.registerTextEditorCommand('nasm-commenter.commentRange', commentRange),
    // ...
  )
}
```

### 5. 命令实现模式

```typescript
async function commentLine(editor: TextEditor) {
  const line = editor.selection.active.line
  const result = await client.sendRequest('nasm-commenter/commentRange', {
    textDocument: { uri: editor.document.uri.toString() },
    startLine: line, endLine: line
  })
  await applyEdits(editor, result.edits)
}
```

### 6. 编辑应用

```typescript
async function applyEdits(editor: TextEditor, edits: CommentTextEdit[]) {
  const workspaceEdit = new WorkspaceEdit()
  for (const edit of edits) {
    workspaceEdit.replace(editor.document.uri, edit.range, edit.newText)
  }
  await workspace.applyEdit(workspaceEdit)
}
```

行尾模式编辑：`range` 指向行末字符位置，`newText` 为 `  ; [nasm-commenter] 注释内容`。

### 7. Code Action Provider

对未注释的指令行，在灯泡菜单提供 "Add NASM Comment"。选择后调用 `commentRange`。

```typescript
class NASMCodeActionProvider implements CodeActionProvider {
  provideCodeActions(document, range): CodeAction[] {
    const line = document.lineAt(range.start.line)
    if (isCommentable(line) && !hasAutoComment(line)) {
      const action = new CodeAction('Add NASM Comment', CodeActionKind.RefactorRewrite)
      action.command = { command: 'nasm-commenter.commentLine', title: 'Add NASM Comment' }
      return [action]
    }
    return []
  }
}
```

### 8. Hover Provider

委托给 Server 的 `instructionHover` 自定义请求，返回 Markdown 格式的指令详细信息。

### 9. 配置管理

```typescript
function getConfig(): ExtensionConfig {
  const cfg = workspace.getConfiguration('nasm-commenter')
  return {
    commentLanguage: cfg.get<'zh'|'en'>('commentLanguage', 'zh'),
    commentStyle: cfg.get<'line-end'|'above'>('commentStyle', 'line-end'),
    detailLevel: cfg.get<'brief'|'normal'|'detailed'>('detailLevel', 'normal'),
    autoCommentOnSave: cfg.get<boolean>('autoCommentOnSave', false),
    protectExistingComments: cfg.get<boolean>('protectExistingComments', true),
    alignComments: cfg.get<boolean>('alignComments', true),
    llmEnabled: cfg.get<boolean>('llm.enabled', false),
    // ... 共 14 项
  }
}
```

配置变更时通过 `workspace.onDidChangeConfiguration` 监听，发送 `nasm-commenter/configDidChange` 通知到 Server。

### 10. 状态栏

显示当前注释统计（已注释行数/总行数）和 LLM 状态。Server 通过 `nasm-commenter/stats` notification 推送。

### 11. 错误处理

- Server 启动失败：显示错误通知，提示检查 Node.js
- 请求超时（10s）：提示"注释生成超时，文件可能过大"
- Server 崩溃：LanguageClient 自动重启（最多3次），超过后禁用扩展并提示

---

## 第二部分：LLM 适配器

### 12. 设计原则

LLM 是**可选增强层**，默认关闭。规则引擎永远可用，LLM 仅在用户显式启用且 API 配置完成时参与。LLM 失败必须静默回退到规则结果，不影响核心功能。

### 13. 适配器接口

```typescript
interface LLMAdapter {
  readonly providerId: string
  readonly displayName: string
  generateComments(request: LLMRequest): Promise<LLMResponse>
  testConnection(): Promise<{ success: boolean; message?: string }>
  countTokens(text: string): number
}

interface LLMRequest {
  mode: 'line' | 'function' | 'document'
  codeLines: CodeLine[]      // 待注释代码
  context?: LLMContext       // 规则引擎已生成的注释作为参考
  language: 'zh' | 'en'
  detailLevel: 'brief' | 'normal' | 'detailed'
  abi?: string
}

interface LLMResponse {
  comments: LLMCommentResult[]
  usage?: { promptTokens; completionTokens; totalTokens }
  raw?: string
}

interface LLMCommentResult {
  line: number
  comment: string
  confidence: number
}
```

### 14. 内置 Provider

| Provider | ID | 配置项 |
|----------|-----|--------|
| OpenAI 兼容 | `openai-compatible` | apiKey, baseUrl, model |
| 豆包/火山引擎 | `doubao` | apiKey, model |
| 本地 Ollama | `ollama` | baseUrl (默认 http://localhost:11434), model |
| Mock（测试用） | `mock` | 固定响应 |

OpenAI 兼容模式可接入任何兼容 OpenAI Chat Completions API 的服务（Azure OpenAI、DeepSeek、通义千问等）。

### 15. Prompt 构建

#### 15.1 System Prompt

```
你是一个 NASM 汇编语言注释专家。为给定的汇编代码生成简洁、准确的中文注释。
规则：
1. 只输出注释内容，不要输出代码
2. 注释要说明指令的作用和操作数含义
3. 系统调用要说明调用名和参数
4. 不要添加 [nasm-commenter] 标记（由客户端添加）
5. 对无法确定的行，输出空字符串
6. 输出 JSON 格式：{"comments": [{"line": 0, "comment": "..."}]}
```

#### 15.2 User Prompt 结构

```
ABI: linux-x64
当前函数: _start
上下文（规则引擎已生成的注释，供参考）:
  mov rax, 1    ; rax = 1 (系统调用号: write)
  mov rdi, 1    ; rdi = 1 (第1参数: fd = stdout)

待注释代码:
  mov rsi, msg
  mov rdx, len
  syscall

请为以上代码生成注释。
```

#### 15.3 隐私保护

发送前将用户标签名替换为占位符（`func_1`, `var_1`），响应后还原。不发送文件路径、注释内容中的敏感信息。

### 16. 响应解析

按优先级尝试：
1. 直接 JSON 解析
2. 提取 ```json ... ``` 代码块后解析
3. 逐行匹配 `行号: 注释` 格式
4. 全部失败 → 返回空数组（回退规则结果）

### 17. 集成策略

```typescript
// CommentEngine 中
async function commentLineWithLLM(line, ctx, config): Promise<LineCommentResult> {
  if (!config.llmEnabled || !this.llm) {
    return this.commentLineRuleBased(line, ctx, config)  // 纯规则
  }
  const ruleResult = this.commentLineRuleBased(line, ctx, config)
  try {
    const llmResult = await this.llm.generateComments({ mode: 'line', codeLines: [line], ... })
    if (llmResult.comments[0]?.comment && llmResult.comments[0].confidence > ruleResult.confidence) {
      return { ...llmResult.comments[0], source: 'llm' }
    }
  } catch (e) {
    // 静默回退
  }
  return ruleResult
}
```

LLM 仅在置信度高于规则结果时覆盖，否则保留规则结果。

### 18. 速率限制与缓存

- 单次请求最多 50 行（超过分批）
- 缓存：相同代码行 + 相同配置 → 缓存 LLM 结果（内存 LRU，1000 条）
- 并发：最多 2 个并发请求
- 超时：30s

### 19. 配置项

```json
"nasm-commenter.llm.enabled": false,
"nasm-commenter.llm.provider": "openai-compatible",
"nasm-commenter.llm.apiKey": "",
"nasm-commenter.llm.baseUrl": "https://api.openai.com/v1",
"nasm-commenter.llm.model": "gpt-4o-mini",
"nasm-commenter.llm.maxLinesPerRequest": 50,
"nasm-commenter.llm.confidenceThreshold": 0.7
```

### 20. 扩展新 Provider

实现 `LLMAdapter` 接口，在 `llm/factory.ts` 注册：
```typescript
class MyProvider implements LLMAdapter { /* ... */ }
LLMFactory.register('my-provider', (config) => new MyProvider(config))
```
无需修改引擎代码。
