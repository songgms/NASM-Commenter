# NASM Commenter

[![CI](https://github.com/songgms/NASM-Commenter/actions/workflows/ci.yml/badge.svg)](https://github.com/songgms/NASM-Commenter/actions/workflows/ci.yml)

为 NASM 汇编代码自动生成高质量中文/英文注释的 VSCode 扩展。**离线规则引擎为主，LLM 为可选增强**——确定性、隐私友好、无 API Key 也完全可用。

```nasm
mov rax, 1                  ; [nasm-commenter] 系统调用号 1（write）
mov rdi, 1                  ; [nasm-commenter] 参数1：fd = 1（1 为 stdout）
mov rsi, msg                ; [nasm-commenter] 参数2：输出缓冲区地址
mov rdx, len                ; [nasm-commenter] 参数3：输出字节数
syscall                     ; [nasm-commenter] 执行 write 系统调用输出字符串
```

## 功能

- **智能行内/行上方注释**：基于数据驱动的指令语义模板（约 90 条常用指令，中英双语）
- **上下文追踪**：寄存器常量传播（含 `eax`→`rax` 别名）、栈帧识别、系统调用参数回溯
- **惯用模式识别**：函数序言/结尾、write/exit 系统调用、strlen 扫描、计数循环等 9 种模式优先整段注释
- **ABI 自动检测**：Linux x64 / Linux x86（int 0x80）/ macOS（0x2000000 基址），可手动指定
- **Hover 提示**：指令语义、标志位影响、寄存器惯例、系统调用号 → 调用名与参数
- **自动补全**：命令位置补全指令名（附语义说明），操作数位置补全寄存器与文档标签
- **实时诊断**：未知指令（Hint）、跳转到未定义标签（Warning）
- **函数块注释**：一键生成 函数名/功能/参数/返回/破坏的寄存器
- **精确移除**：所有自动注释带 `[nasm-commenter]` 标记，可批量移除，用户手写注释不受影响
- **可选 LLM 增强**：OpenAI 兼容端点 / Ollama 本地模型，默认关闭；仅在规则引擎无法注释时介入，失败静默回退

## 命令与快捷键

| 命令 | 快捷键 | 功能 |
|------|--------|------|
| `NASM Commenter: 注释当前行` | `Ctrl+;` | 注释光标行 |
| `NASM Commenter: 注释选中区域` | `Ctrl+Shift+;` | 注释选中范围 |
| `NASM Commenter: 注释整个文件` | — | 全文注释（幂等，已有注释自动跳过） |
| `NASM Commenter: 注释当前函数` | — | 生成函数块注释 |
| `NASM Commenter: 移除自动注释` | — | 仅移除带标记的自动注释 |
| `NASM Commenter: 切换行内/上方注释` | — | 切换注释样式 |

## 配置（`nasm-commenter.*`）

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `enable` | `true` | 总开关 |
| `language` | `zh` | 注释语言 zh/en |
| `style` | `inline` | inline（行内）/ above（行上方） |
| `minColumn` | `32` | 行内注释最小对齐列 |
| `verbose` | `false` | 详细模式（附加标志位与副作用说明） |
| `autoAnnotate` | `false` | 保存时自动注释 |
| `protectExistingComments` | `true` | 保护用户已有注释（不覆盖手写注释） |
| `llm.enabled` | `false` | LLM 增强（规则引擎无法注释的行才调用） |
| `llm.provider` | `openai` | openai（兼容端点）/ ollama |
| `llm.apiKey` / `baseUrl` / `model` / `timeout` / `cache` | — | LLM 连接配置 |

## 架构

客户端-服务器（LSP）双进程架构：注释生成全部在独立的语言服务器进程内完成，不阻塞 UI。

```
VSCode (client/src)  --JSON-RPC over IPC-->  Language Server (server/src)
                                              Lexer → ContextTracker → CommentEngine
                                              KnowledgeBase / PatternMatcher / LLMAdapter
```

- **知识库数据驱动**（`data/*.json`）：新增指令支持只需编辑 JSON，社区可贡献，JSON Schema 校验
- **Server 无状态 handler + 上下文追踪**：模板 → 模式 → 上下文增强 → LLM 兜底 的分层生成
- 详见 [docs/01-architecture-and-lsp.md](./docs/01-architecture-and-lsp.md)

## 目录结构

```
├── client/src/      # VSCode 扩展宿主：命令、状态栏、编辑应用
├── server/src/      # 语言服务器（核心逻辑全在此）
│   ├── lexer/       # 词法分析：tokenizer、操作数、行解析、预处理
│   ├── knowledge/   # 知识库加载与四个 Store
│   ├── engine/      # 注释引擎：模板渲染、格式化、去重、编排
│   ├── handlers/    # 指令分类处理（数据传送/算术/逻辑/控制流/系统/串/伪指令…）
│   ├── context/     # 上下文：寄存器传播、函数/循环/栈帧、模式匹配
│   ├── llm/         # 可选 LLM 增强（OpenAI 兼容 / Ollama）
│   ├── lsp/         # Hover、补全、CodeAction、诊断
│   └── types/       # 前后端共享类型（零运行时依赖）
├── data/            # 知识库 JSON（社区贡献入口）
├── schemas/         # JSON Schema
├── tests/           # unit / integration(fixtures) / snapshot 三层
├── docs/            # 设计文档（8 篇）
└── scripts/         # 校验、图标生成、快照更新
```

## 安装

- **从 VSIX**：`code --install-extension nasm-commenter-<版本>.vsix`，或在扩展视图 `···` → 「从 VSIX 安装...」；构建产物见仓库 Release / CI Artifacts
- **从源码**：`npm install && npm run build && npx vsce package`，然后按上述方式安装生成的 `.vsix`；调试直接 F5
- **Marketplace**：计划中

## 开发

要求 Node ≥ 18、npm ≥ 9。

```bash
npm install
npm run build        # tsc -b（client + server，含类型检查）
npm test             # 单元 + 集成 + 快照（Vitest）
npm run lint         # ESLint
npm run validate:schema  # 知识库数据校验
```

调试：F5 启动 "Run Extension" 配置，在新窗口打开 `.asm` 文件；服务端断点用 "Attach to Server"（端口 6009），或直接用 "Client + Server" 复合配置。

## 贡献知识库数据（无需会写代码）

1. 编辑 `data/instruction-semantics.json`（格式见 `schemas/instruction-schema.json`）
2. 运行 `node scripts/validate-schema.js`
3. 在 `tests/` 添加用例并提交 PR

详见 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [docs/07-ai-development-guide.md](./docs/07-ai-development-guide.md)。

## 测试

- **单元**：lexer / engine / handlers / context / knowledge / llm / utils
- **集成**：5 组端到端 fixtures 与期望输出逐一对比
- **快照**：`npm run test:snapshot`；注释逻辑有意变更时 `npm run test:snapshot:update` 重新生成（CI 禁止更新）

## 文档

完整设计文档见 [docs/](./docs/00-index.md)（架构与 LSP 协议、词法分析器、注释引擎、上下文追踪、LLM 适配器、测试策略、目录结构、AI 开发教程）。

## 与设计文档的实现差异

以下为有意偏离，其余均遵循 docs/ 设计文档（命名与接口以 07 号教程的优先级规则裁决）：

| 差异 | 原因 |
|------|------|
| 省略 Webpack，改用 `tsc -b` 项目引用双入口构建 | 教程仅要求 `npm run build` 可用；tsc 更简单可靠 |
| 不含 `@vscode/test-electron` 真实 VSCode 集成测试 | 下载 Electron 体积大、CI 环境不可控；server 逻辑由集成测试覆盖 |
| 系统调用表为常用子集（x64 157 条 / x86 152 条 / macOS 27 条） | 保证数据准确性；可按教程贡献指南补全 |
| 命令 ID 使用 `annotateFile` 等命名（非 01/04 号的 `commentRange` 等） | 遵循 07 号教程的命名与优先级规则 |
| 测试框架为 Vitest（非 05 号的 Mocha + Chai） | 07 号教程声明的优先级裁决 |

## License

[MIT](./LICENSE)
