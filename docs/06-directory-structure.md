# 开发总目录结构

> 本文档定义 NASM Commenter 扩展开发完成后的完整目录结构，标注每个文件/目录的职责、创建阶段和依赖关系。
> 标记说明：`[骨架]` = 已创建，`[待开发]` = 开发阶段需编写，`[可选]` = 按需创建。

---

## 一、顶层目录树

```
nasm-commenter/
├── .github/                          # GitHub 配置
│   ├── workflows/
│   │   └── ci.yml                    [骨架] CI 流水线（lint + 验证 + 构建 + 测试）
│   └── dependabot.yml                [骨架] 依赖自动更新
├── .vscode/                          # VSCode 开发配置
│   ├── launch.json                   [骨架] 调试启动配置（Extension Host + 附加到 Server）
│   └── tasks.json                    [骨架] 构建任务（npm: build / npm: watch）
├── client/                           # VSCode 客户端（前端）
│   ├── src/
│   │   ├── extension.ts              [待开发] 扩展入口：activate/deactivate，启动 LSP 客户端
│   │   ├── commands/
│   │   │   ├── index.ts              [待开发] 命令注册中心，统一导出所有命令
│   │   │   ├── annotate-file.ts      [待开发] "注释整个文件" 命令实现
│   │   │   ├── annotate-selection.ts [待开发] "注释选中区域" 命令实现
│   │   │   ├── annotate-line.ts      [待开发] "注释当前行" 命令实现
│   │   │   ├── remove-comments.ts    [待开发] "移除自动注释" 命令实现
│   │   │   └── toggle-inline.ts      [待开发] "切换行内/上方注释" 命令实现
│   │   ├── config.ts                 [待开发] 客户端配置读取与变更监听
│   │   ├── status-bar.ts             [待开发] 状态栏项：显示注释统计、ABI 检测结果
│   │   └── output-channel.ts         [待开发] 输出面板：调试日志、LLM 请求记录
│   └── tsconfig.json                 [骨架] 客户端 TypeScript 配置
├── server/                           # LSP 语言服务器（后端，独立进程）
│   ├── src/
│   │   ├── index.ts                  [待开发] 服务器入口：创建 connection、注册 handler、启动
│   │   ├── server.ts                 [待开发] LanguageServer 类：生命周期管理、文档同步
│   │   ├── lexer/
│   │   │   ├── index.ts              [待开发] 词法分析器统一导出
│   │   │   ├── tokenizer.ts          [待开发] 核心分词器：逐字符扫描，输出 Token 流
│   │   │   ├── token-definitions.ts  [待开发] Token 类型枚举、关键字/寄存器/指令名常量表
│   │   │   ├── line-parser.ts        [待开发] 行解析器：将 Token 流组装为 ParsedLine
│   │   │   ├── operand-parser.ts     [待开发] 操作数解析器：识别寄存器/立即数/内存/标签
│   │   │   └── preprocessor.ts       [待开发] 预处理：%define / %macro / %include 展开（简化版）
│   │   ├── knowledge/
│   │   │   ├── index.ts              [待开发] 知识库统一导出
│   │   │   ├── loader.ts             [待开发] JSON 数据加载器：启动时加载并校验
│   │   │   ├── instruction-store.ts  [待开发] 指令语义查询：按 mnemonic + 操作数签名匹配模板
│   │   │   ├── pattern-store.ts      [待开发] 模式存储：序列匹配、优先级排序
│   │   │   ├── syscall-store.ts      [待开发] 系统调用查询：按 ABI + 编号查名称/参数
│   │   │   └── register-store.ts     [待开发] 寄存器约定查询：按 ABI 查参数/返回寄存器
│   │   ├── engine/
│   │   │   ├── index.ts              [待开发] 注释引擎统一导出
│   │   │   ├── comment-engine.ts     [待开发] 核心引擎：编排 lexer → context → handlers → 输出
│   │   │   ├── template-renderer.ts  [待开发] 模板渲染器：{dst}/{src}/{imm} 变量替换
│   │   │   ├── comment-formatter.ts  [待开发] 注释格式化：缩进对齐、行内/上方、语言选择
│   │   │   └── deduplicator.ts       [待开发] 去重器：跳过已有相同注释、避免重复标注
│   │   ├── handlers/
│   │   │   ├── index.ts              [待开发] 处理器路由：按指令类型分发
│   │   │   ├── data-transfer.ts      [待开发] 数据传送类：mov/xchg/push/pop/lea/movzx/movsx
│   │   │   ├── arithmetic.ts         [待开发] 算术类：add/sub/inc/dec/neg/cmp/mul/imul/div/idiv
│   │   │   ├── logic.ts              [待开发] 逻辑/位运算：and/or/xor/not/test/shl/shr/sar/rol/ror
│   │   │   ├── control-flow.ts       [待开发] 控制流：jmp/jcc/call/ret/loop
│   │   │   ├── stack.ts              [待开发] 栈操作：enter/leave（push/pop 在 data-transfer）
│   │   │   ├── system.ts             [待开发] 系统类：syscall/int/nop/hlt/cpuid/cli/sti
│   │   │   ├── string.ts             [待开发] 字符串指令：movsb/movsd/cmpsb/scasb/lodsb/stosb/rep
│   │   │   ├── pseudo.ts             [待开发] 伪指令：section/global/extern/equ/times/align/bits
│   │   │   ├── data-define.ts        [待开发] 数据定义：db/dw/dd/dq
│   │   │   └── label.ts              [待开发] 标签处理：函数入口标签、跳转目标标签
│   │   ├── context/
│   │   │   ├── index.ts              [待开发] 上下文模块统一导出
│   │   │   ├── document-context.ts   [待开发] 文档级上下文：section 列表、全局符号、ABI 检测
│   │   │   ├── function-tracker.ts   [待开发] 函数追踪器：识别函数边界、参数、局部变量
│   │   │   ├── register-tracker.ts   [待开发] 寄存器追踪：记录最近赋值、数据流推断
│   │   │   ├── loop-tracker.ts       [待开发] 循环追踪：识别循环结构（loop/条件跳转回跳）
│   │   │   └── pattern-matcher.ts    [待开发] 多指令模式匹配器：滑动窗口 + 约束校验
│   │   ├── llm/
│   │   │   ├── index.ts              [待开发] LLM 模块统一导出
│   │   │   ├── adapter.ts            [待开发] LLM 适配器接口定义
│   │   │   ├── openai-adapter.ts     [待开发] OpenAI 兼容 API 适配器
│   │   │   ├── ollama-adapter.ts     [待开发] Ollama 本地模型适配器
│   │   │   ├── prompt-builder.ts     [待开发] Prompt 构建器：汇编上下文 + 指令说明 + 输出格式
│   │   │   └── cache.ts              [待开发] 注释缓存：按行哈希缓存 LLM 结果，避免重复请求
│   │   ├── lsp/
│   │   │   ├── index.ts              [待开发] LSP handler 统一导出
│   │   │   ├── code-action.ts        [待开发] Code Action：提供"添加注释"/"移除注释"快捷操作
│   │   │   ├── completion.ts         [待开发] 自动补全：指令名、寄存器、标签补全（可选增强）
│   │   │   ├── hover.ts              [待开发] Hover：悬停显示指令说明 + 标志位影响
│   │   │   └── diagnostics.ts        [待开发] 诊断：未知指令、ABI 不匹配等提示（可选）
│   │   ├── types/                    [骨架] 全部类型定义（9 个文件）
│   │   │   ├── index.ts              [骨架] 统一导出
│   │   │   ├── token.ts              [骨架] Token 类型
│   │   │   ├── operand.ts            [骨架] 操作数类型
│   │   │   ├── line.ts               [骨架] 解析行类型
│   │   │   ├── knowledge.ts          [骨架] 知识库类型
│   │   │   ├── comment.ts            [骨架] 注释结果类型
│   │   │   ├── context.ts            [骨架] 上下文类型
│   │   │   ├── config.ts             [骨架] 配置类型
│   │   │   └── lsp.ts                [骨架] LSP 扩展类型
│   │   └── utils/
│   │       ├── index.ts              [待开发] 工具函数统一导出
│   │       ├── abi-detector.ts       [待开发] ABI 检测器：根据 section/寄存器/系统调用推断平台
│   │       ├── indent.ts             [待开发] 缩进计算：根据行内容计算注释对齐列
│   │       ├── logger.ts             [待开发] 日志工具：分级日志，输出到 LSP 通道
│   │       └── hash.ts               [待开发] 行哈希：用于 LLM 缓存键
│   └── tsconfig.json                 [骨架] 服务器 TypeScript 配置
├── data/                             [骨架] 知识库数据（纯 JSON，社区可贡献）
│   ├── instruction-semantics.json    [骨架] 79 条指令语义 + 中文注释模板
│   ├── patterns.json                 [骨架] 8 个惯用多指令模式
│   ├── register-conventions.json     [骨架] 3 套 ABI 寄存器约定
│   └── syscalls/
│       ├── linux-x64.json            [骨架] 372 个 Linux x64 系统调用
│       └── linux-x86.json            [骨架] 406 个 Linux x86 系统调用
├── schemas/                          [骨架] JSON Schema（数据校验 + IDE 提示）
│   ├── instruction-schema.json       [骨架] 指令语义 Schema
│   └── patterns-schema.json          [骨架] 模式定义 Schema
├── scripts/                          [骨架] 工程脚本
│   └── validate-schema.js            [骨架] 知识库数据验证脚本（CI 中运行）
├── docs/                             [骨架] 开发文档（11 篇）
│   ├── 00-index.md                   [骨架] 文档索引
│   ├── 01-architecture.md            [骨架] 架构设计
│   ├── 02-lsp-protocol.md            [骨架] LSP 协议设计
│   ├── 03-lexer.md                   [骨架] 词法分析器设计
│   ├── 04-knowledge-base.md          [骨架] 知识库设计
│   ├── 05-comment-engine.md          [骨架] 注释引擎设计
│   ├── 06-context-and-patterns.md    [骨架] 上下文追踪与模式匹配
│   ├── 07-vscode-client.md           [骨架] VSCode 客户端设计
│   ├── 08-llm-adapter.md             [骨架] LLM 适配器设计
│   ├── 09-testing.md                 [骨架] 测试策略
│   ├── 10-build-and-ci.md            [骨架] 构建与 CI
│   └── 11-directory-structure.md     [骨架] 本文档
├── tests/                            [待开发] 测试目录
│   ├── unit/
│   │   ├── lexer/
│   │   │   ├── tokenizer.test.ts     [待开发] 分词器单元测试
│   │   │   ├── operand-parser.test.ts [待开发] 操作数解析测试
│   │   │   └── line-parser.test.ts   [待开发] 行解析测试
│   │   ├── engine/
│   │   │   ├── template-renderer.test.ts [待开发] 模板渲染测试
│   │   │   ├── comment-formatter.test.ts [待开发] 注释格式化测试
│   │   │   └── deduplicator.test.ts  [待开发] 去重测试
│   │   ├── handlers/
│   │   │   ├── data-transfer.test.ts [待开发] 数据传送指令测试
│   │   │   ├── arithmetic.test.ts    [待开发] 算术指令测试
│   │   │   ├── logic.test.ts         [待开发] 逻辑指令测试
│   │   │   ├── control-flow.test.ts  [待开发] 控制流测试
│   │   │   └── system.test.ts        [待开发] 系统指令测试
│   │   ├── context/
│   │   │   ├── function-tracker.test.ts [待开发] 函数追踪测试
│   │   │   ├── register-tracker.test.ts [待开发] 寄存器追踪测试
│   │   │   └── pattern-matcher.test.ts [待开发] 模式匹配测试
│   │   └── knowledge/
│   │       ├── instruction-store.test.ts [待开发] 指令查询测试
│   │       └── syscall-store.test.ts [待开发] 系统调用查询测试
│   ├── integration/
│   │   ├── fixtures/                 [待开发] 测试用例汇编文件
│   │   │   ├── hello-world.asm       [待开发] 基础用例
│   │   │   ├── function-call.asm     [待开发] 函数调用用例
│   │   │   ├── loop.asm              [待开发] 循环用例
│   │   │   ├── syscall.asm           [待开发] 系统调用用例
│   │   │   └── mixed.asm             [待开发] 综合用例
│   │   └── engine.integration.test.ts [待开发] 端到端注释生成测试
│   └── snapshot/
│       ├── snapshots/                [待开发] 快照输出
│       └── snapshot.test.ts          [待开发] 快照对比测试
├── examples/                         [可选] 示例汇编文件（用于演示和手动测试）
│   ├── hello.asm                     [可选] Hello World
│   ├── factorial.asm                 [可选] 递归阶乘
│   └── memcpy.asm                    [可选] 内存拷贝
├── .eslintrc.json                    [骨架] ESLint 配置
├── .gitignore                        [骨架] Git 忽略
├── CHANGELOG.md                      [骨架] 变更日志
├── CONTRIBUTING.md                   [骨架] 贡献指南
├── LICENSE                           [骨架] MIT 协议
├── README.md                         [骨架] 项目说明 + 方案文档
├── language-configuration.json       [骨架] NASM 语言配置（注释、括号匹配）
├── package.json                      [骨架] 扩展清单 + 依赖 + 脚本
├── tsconfig.json                     [骨架] 根 TypeScript 配置
└── webpack.config.js                 [骨架] webpack 双入口打包配置
```

---

## 二、模块依赖关系图

```
                    ┌─────────────┐
                    │   client/   │  VSCode 扩展前端
                    │ extension.ts│
                    └──────┬──────┘
                           │ LSP (stdio)
                    ┌──────▼──────┐
                    │   server/   │  语言服务器
                    │  index.ts   │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │   lexer/    │  │   engine/   │  │    lsp/     │
   │  词法分析    │  │  注释引擎    │  │ LSP 处理器  │
   └──────┬──────┘  └──────┬──────┘  └─────────────┘
          │                │
          │         ┌──────┼──────┐
          │         │      │      │
          │   ┌─────▼─┐ ┌──▼──┐ ┌─▼──────┐
          │   │handlers│ │context│ │  llm/  │
          │   │ 指令处理 │ │上下文 │ │ LLM增强 │
          │   └─────┬─┘ └──┬──┘ └────────┘
          │         │      │
          │    ┌────▼──────▼────┐
          │    │   knowledge/   │  知识库（JSON 数据）
          │    │  指令/模式/调用  │
          │    └────────────────┘
          │
   ┌──────▼──────┐
   │   types/    │  共享类型定义
   └─────────────┘
```

---

## 三、开发阶段文件创建顺序

按依赖关系，建议以下顺序开发：

### 阶段 1：基础设施（第 1 周）
| 序号 | 文件 | 依赖 | 说明 |
|------|------|------|------|
| 1 | `server/src/utils/logger.ts` | 无 | 日志工具 |
| 2 | `server/src/utils/indent.ts` | 无 | 缩进计算 |
| 3 | `server/src/utils/hash.ts` | 无 | 哈希工具 |
| 4 | `server/src/knowledge/loader.ts` | types | 数据加载器 |
| 5 | `server/src/knowledge/instruction-store.ts` | loader | 指令查询 |
| 6 | `server/src/knowledge/syscall-store.ts` | loader | 系统调用查询 |
| 7 | `server/src/knowledge/register-store.ts` | loader | 寄存器约定查询 |
| 8 | `server/src/knowledge/pattern-store.ts` | loader | 模式存储 |

### 阶段 2：词法分析（第 1-2 周）
| 序号 | 文件 | 依赖 | 说明 |
|------|------|------|------|
| 9 | `server/src/lexer/token-definitions.ts` | types | Token 常量表 |
| 10 | `server/src/lexer/tokenizer.ts` | definitions | 核心分词器 |
| 11 | `server/src/lexer/operand-parser.ts` | tokenizer | 操作数解析 |
| 12 | `server/src/lexer/line-parser.ts` | operand-parser | 行解析器 |
| 13 | `server/src/lexer/preprocessor.ts` | line-parser | 预处理（简化） |

### 阶段 3：注释引擎核心（第 2-3 周）
| 序号 | 文件 | 依赖 | 说明 |
|------|------|------|------|
| 14 | `server/src/engine/template-renderer.ts` | types | 模板渲染 |
| 15 | `server/src/engine/comment-formatter.ts` | utils | 注释格式化 |
| 16 | `server/src/engine/deduplicator.ts` | types | 去重器 |
| 17 | `server/src/handlers/data-transfer.ts` | stores, renderer | 数据传送处理 |
| 18 | `server/src/handlers/arithmetic.ts` | stores, renderer | 算术处理 |
| 19 | `server/src/handlers/logic.ts` | stores, renderer | 逻辑处理 |
| 20 | `server/src/handlers/control-flow.ts` | stores, renderer | 控制流处理 |
| 21 | `server/src/handlers/system.ts` | syscall-store | 系统指令处理 |
| 22 | `server/src/handlers/string.ts` | stores, renderer | 字符串指令 |
| 23 | `server/src/handlers/stack.ts` | stores, renderer | 栈操作 |
| 24 | `server/src/handlers/pseudo.ts` | types | 伪指令 |
| 25 | `server/src/handlers/data-define.ts` | types | 数据定义 |
| 26 | `server/src/handlers/label.ts` | types | 标签处理 |
| 27 | `server/src/engine/comment-engine.ts` | handlers, formatter | 核心引擎编排 |

### 阶段 4：上下文与模式（第 3-4 周）
| 序号 | 文件 | 依赖 | 说明 |
|------|------|------|------|
| 28 | `server/src/utils/abi-detector.ts` | types | ABI 检测 |
| 29 | `server/src/context/document-context.ts` | abi-detector | 文档上下文 |
| 30 | `server/src/context/function-tracker.ts` | document-context | 函数追踪 |
| 31 | `server/src/context/register-tracker.ts` | document-context | 寄存器追踪 |
| 32 | `server/src/context/loop-tracker.ts` | document-context | 循环追踪 |
| 33 | `server/src/context/pattern-matcher.ts` | pattern-store | 模式匹配 |

### 阶段 5：LSP 服务器（第 4 周）
| 序号 | 文件 | 依赖 | 说明 |
|------|------|------|------|
| 34 | `server/src/lsp/code-action.ts` | comment-engine | Code Action |
| 35 | `server/src/lsp/hover.ts` | instruction-store | Hover 提示 |
| 36 | `server/src/lsp/completion.ts` | stores | 自动补全（可选） |
| 37 | `server/src/lsp/diagnostics.ts` | types | 诊断（可选） |
| 38 | `server/src/server.ts` | lsp, engine, context | 服务器类 |
| 39 | `server/src/index.ts` | server | 入口 |

### 阶段 6：VSCode 客户端（第 5 周）
| 序号 | 文件 | 依赖 | 说明 |
|------|------|------|------|
| 40 | `client/src/config.ts` | 无 | 配置读取 |
| 41 | `client/src/output-channel.ts` | 无 | 输出面板 |
| 42 | `client/src/status-bar.ts` | config | 状态栏 |
| 43 | `client/src/commands/annotate-file.ts` | config | 注释文件命令 |
| 44 | `client/src/commands/annotate-selection.ts` | config | 注释选区命令 |
| 45 | `client/src/commands/annotate-line.ts` | config | 注释行命令 |
| 46 | `client/src/commands/remove-comments.ts` | config | 移除注释命令 |
| 47 | `client/src/commands/toggle-inline.ts` | config | 切换模式命令 |
| 48 | `client/src/commands/index.ts` | all commands | 命令注册 |
| 49 | `client/src/extension.ts` | commands, status-bar | 扩展入口 |

### 阶段 7：LLM 增强（第 5-6 周，可选）
| 序号 | 文件 | 依赖 | 说明 |
|------|------|------|------|
| 50 | `server/src/llm/adapter.ts` | types | 适配器接口 |
| 51 | `server/src/llm/prompt-builder.ts` | context | Prompt 构建 |
| 52 | `server/src/llm/cache.ts` | hash | 结果缓存 |
| 53 | `server/src/llm/openai-adapter.ts` | adapter | OpenAI 实现 |
| 54 | `server/src/llm/ollama-adapter.ts` | adapter | Ollama 实现 |

### 阶段 8：测试（贯穿全程）
| 序号 | 文件 | 对应模块 |
|------|------|----------|
| 55+ | `tests/unit/**` | 每个源文件对应一个测试 |
| 55+ | `tests/integration/**` | 端到端测试 + fixtures |
| 55+ | `tests/snapshot/**` | 快照对比 |

---

## 四、文件数量统计

| 类别 | 已创建（骨架） | 待开发 | 总计 |
|------|:---:|:---:|:---:|
| 开发文档 | 12 | 0 | 12 |
| 项目配置 | 12 | 0 | 12 |
| 类型定义 | 9 | 0 | 9 |
| 知识库数据 | 4 | 0 | 4 |
| Schema | 2 | 0 | 2 |
| 工程脚本 | 1 | 0 | 1 |
| CI/CD | 2 | 0 | 2 |
| 客户端源码 | 1 | 12 | 13 |
| 服务器源码 | 0 | 42 | 42 |
| 测试文件 | 0 | 20+ | 20+ |
| 示例文件 | 0 | 3 | 3 |
| **合计** | **43** | **77+** | **120+** |

---

## 五、关键设计约束

1. **client 与 server 严格分离**：客户端只做 UI 和命令转发，所有注释逻辑在 server 进程
2. **knowledge 数据驱动**：新增指令支持只需改 JSON，无需改代码
3. **handlers 无状态**：每个 handler 只依赖输入行 + context，不持有内部状态
4. **types 零依赖**：类型文件不 import 任何运行时代码，可被前后端共享
5. **llm 可选**：LLM 模块通过接口注入，未配置时引擎完全走规则路径
6. **测试与源码同构**：`tests/unit/` 目录结构镜像 `server/src/`，便于定位
