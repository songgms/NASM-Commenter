# 01 - 架构设计与 LSP 协议

## 1. 总体架构

采用 **客户端-服务器（LSP）架构**：

```
VSCode 编辑器
    │ stdio / IPC
    ▼
┌─────────────────────────────────────────────┐
│  扩展客户端 (client/src) — Extension Host    │
│  · 命令注册与快捷键                          │
│  · 注释编辑应用                              │
│  · Code Action / Hover 转发                  │
│  · 配置读取与同步                            │
└──────────────────┬──────────────────────────┘
                   │ LSP (JSON-RPC over stdio)
                   ▼
┌─────────────────────────────────────────────┐
│  Language Server (server/src) — 独立进程      │
│  Lexer → Engine → ContextTracker             │
│  KnowledgeBase / PatternMatcher / LLMAdapter │
└─────────────────────────────────────────────┘
```

### 1.1 进程职责

**客户端**：启动 Server 子进程、注册命令/Provider、应用 `TextEdit`、同步配置。
**Server**：维护文档内容、处理 LSP 请求、词法分析、注释生成、上下文追踪、加载知识库。

### 1.2 启动流程

```
activate() → 创建 LanguageClient → client.start() (fork server)
           → 注册命令 → 注册 CodeActionProvider → 注册 HoverProvider
```

### 1.3 模块依赖规则

- `lexer/` 不依赖其他业务模块（纯解析）
- `knowledge/` 不依赖 `lexer/` 或 `engine/`（纯数据加载）
- `engine/` 依赖 `knowledge/` 和 `context/`
- `handlers/` 依赖所有业务模块，是编排层
- `llm/` 是可选依赖，通过接口注入
- `types/` 零依赖，可被前后端共享

### 1.4 性能与错误处理

| 维度 | 策略 |
|------|------|
| 增量分析 | 缓存 ParsedLine[]，变更时仅重算受影响基本块 |
| 知识库 | 启动一次性加载（<1MB），O(1) Map 查找 |
| 大文件 | >5000 行显示进度，单次请求 10s 超时 |
| 词法失败 | 标记 Unknown，生成 fallback 注释 |
| 指令未知 | fallback 注释，confidence=0.3 |
| LLM 失败 | 回退纯规则结果 |
| Server 崩溃 | 客户端自动重启，最多 3 次 |

---

## 2. 数据流

### 2.1 单行注释

```
用户按 Ctrl+; → client 发送 commentRange(当前行)
→ server: 获取行文本 → tokenize → parseLine
→ KnowledgeBase.lookup → ContextTracker.traceLine
→ CommentEngine.generate → 构造 CommentTextEdit
→ client: 应用 WorkspaceEdit → 编辑器显示
```

### 2.2 批量注释

```
commentDocument → 全文解析 → 构建基本块 → 上下文追踪
→ PatternMatcher 扫描 → 逐行 generate → 合并（模式优先）
→ 已有注释保护 → 批量 TextEdit[]
```

---

## 3. LSP 自定义协议

所有自定义方法使用 `nasm-commenter/` 前缀。

### 3.1 方法清单

| 方法 | 类型 | 用途 |
|------|------|------|
| `commentRange` | request | 指定行范围生成注释 |
| `commentDocument` | request | 整个文档生成注释 |
| `commentFunction` | request | 当前函数生成块注释 |
| `removeAutoComments` | request | 移除自动生成的注释 |
| `instructionHover` | request | 指令详细悬停信息 |
| `configDidChange` | notification | 配置变更通知 |

### 3.2 commentRange

**请求**：
```typescript
interface CommentRangeParams {
  textDocument: { uri: string }
  startLine: number  // 0-based, inclusive
  endLine: number
}
```

**响应**：
```typescript
interface CommentRangeResult {
  edits: CommentTextEdit[]
  stats: { totalLines; commentedLines; skippedLines; bySource }
}
interface CommentTextEdit {
  range: { start: {line, character}; end: {line, character} }
  newText: string
}
```

**编辑规则**：
- 行尾模式：`range` 为行尾，`newText` 为 `  ; [nasm-commenter] 注释`
- 行上方模式：`range` 为行首，`newText` 为 `{缩进}; [nasm-commenter] 注释\n`
- 已有注释且 `protectExistingComments=true` → 跳过

### 3.3 commentDocument

请求仅含 `textDocument`，响应同 `CommentRangeResult`。内部先执行全文上下文追踪和模式匹配。

### 3.4 commentFunction

从光标行向上找最近 label 作为函数起始，向下找下一个 label 或 `ret` 作为结束。

**响应**：
```typescript
interface CommentFunctionResult {
  functionStartLine: number
  functionName: string
  blockComment: string  // 不含分号前缀
  confidence: number
}
```

块注释格式：
```
; 函数名: {name}
; 功能: {description}
; 参数: {args}
; 返回: {return}
; 破坏的寄存器: {clobbered}
```

### 3.5 removeAutoComments

通过 `[nasm-commenter]` 标记识别自动注释，正则 `; \[nasm-commenter\].*$` 移除。

**标记策略（方案 A，MVP 采用）**：
```nasm
mov rax, 1    ; [nasm-commenter] rax = 1 (系统调用号: write)
```
优点：简单可靠、可持久化、可精确移除。

### 3.6 instructionHover

返回指令的 summary/description/flagsAffected/category/operandNotes，渲染为 Markdown。

### 3.7 标准 LSP 能力

- `textDocument/hover`：光标在指令名→指令语义；在寄存器→寄存器约定
- `textDocument/codeAction`：未注释行提供 "Add NASM Comment" action
- 文档同步：`TextDocumentSyncKind.Incremental`

### 3.8 初始化握手

```typescript
capabilities: {
  textDocumentSync: Incremental,
  hoverProvider: true,
  codeActionProvider: true
}
```
客户端 `onReady` 后发送 `configDidChange` 初始配置。
