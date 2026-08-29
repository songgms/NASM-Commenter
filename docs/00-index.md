# NASM Commenter 开发文档索引

> **说明**：本目录为设计文档（描述目标设计）。当前实现与之存在少量有意差异
> （构建工具、测试框架、数据规模等），详见仓库根目录 [README 的「与设计文档的实现差异」](../README.md#与设计文档的实现差异)。

本目录包含 NASM Commenter VSCode 扩展的完整正式开发文档，共 8 篇，按阅读顺序排列。

## 文档清单

| 编号 | 文档 | 内容 | 读者 |
|------|------|------|------|
| 00 | [本文档](./00-index.md) | 文档索引与阅读指南 | 所有人 |
| 01 | [架构设计与 LSP 协议](./01-architecture-and-lsp.md) | 进程模型、模块划分、数据流、自定义 LSP 方法、请求/响应格式 | 架构师、全栈开发者 |
| 02 | [词法分析器与知识库](./02-lexer-and-knowledge.md) | Token 识别、操作数解析、内存寻址、指令语义数据格式、模板系统、系统调用表 | 核心模块开发者、数据贡献者 |
| 03 | [注释引擎与上下文追踪](./03-engine-and-context.md) | 模板匹配、注释生成流程、基本块、寄存器传播、系统调用回溯、模式识别 | 核心模块开发者 |
| 04 | [VSCode 客户端与 LLM 适配器](./04-client-and-llm.md) | 扩展激活、命令注册、编辑应用、配置同步、多 Provider 接口、Prompt 设计、隐私保护 | 客户端/LLM 开发者 |
| 05 | [测试策略与构建 CI](./05-testing-and-ci.md) | 单元/集成/快照测试、覆盖率、Fixture 规范、构建流程、GitHub Actions、发布流程 | 测试/DevOps/维护者 |
| 06 | [开发总目录结构](./06-directory-structure.md) | 完整目录树、模块依赖图、开发顺序、文件统计 | 所有人 |
| 07 | [AI 开发教程](./07-ai-development-guide.md) | 给 AI 协作者的可执行开发手册：约束、逐步指令、代码模板、验证标准 | AI 协作者、自动化 Agent |

## 推荐阅读路径

### 新贡献者（快速上手）
1. [架构设计与 LSP 协议](./01-architecture-and-lsp.md) — 了解整体结构
2. [词法分析器与知识库](./02-lexer-and-knowledge.md) — 最简单的贡献入口（添加指令注释模板）
3. [测试策略与构建 CI](./05-testing-and-ci.md) — 了解如何验证你的改动

### 核心开发者（实现功能）
1. [架构设计与 LSP 协议](./01-architecture-and-lsp.md)
2. [词法分析器与知识库](./02-lexer-and-knowledge.md)
3. [注释引擎与上下文追踪](./03-engine-and-context.md)
4. 按需阅读 [VSCode 客户端与 LLM 适配器](./04-client-and-llm.md)

### 发布管理者
1. [测试策略与构建 CI](./05-testing-and-ci.md)
2. [开发总目录结构](./06-directory-structure.md)

### AI 协作者
1. [AI 开发教程](./07-ai-development-guide.md) — 直接从这里开始，包含所有硬约束和逐步指令
2. 按需查阅对应设计文档

## 项目结构速览

```
nasm-commenter/
├── package.json              # 扩展清单 + 依赖 + 脚本
├── tsconfig.json             # 根 TypeScript 配置
├── webpack.config.js         # 双入口打包配置
├── language-configuration.json  # NASM 语言配置（括号匹配等）
├── client/                   # VSCode 客户端（扩展宿主进程）
│   ├── src/
│   │   ├── extension.ts      # 入口
│   │   ├── commands/         # 命令实现
│   │   ├── providers/        # CodeAction/Hover
│   │   └── ...
│   └── tsconfig.json
├── server/                   # LSP 服务端（独立进程）
│   ├── src/
│   │   ├── server.ts         # 入口
│   │   ├── lexer/            # 词法分析
│   │   ├── engine/           # 注释引擎 + 上下文追踪
│   │   ├── knowledge/        # 知识库加载
│   │   ├── llm/              # LLM 适配器
│   │   ├── handlers/         # LSP 请求处理器
│   │   └── types/            # 类型定义
│   └── tsconfig.json
├── data/                     # 知识库数据（JSON，社区可贡献）
│   ├── instruction-semantics.json
│   ├── patterns.json
│   ├── register-conventions.json
│   └── syscalls/
│       ├── linux-x64.json
│       └── linux-x86.json
├── schemas/                  # JSON Schema（数据验证）
├── docs/                     # 本文档目录
├── test/                     # 测试代码 + Fixture
├── scripts/                  # 工具脚本（schema 验证等）
├── .github/workflows/        # CI 配置
├── README.md                 # 用户面向的方案文档
├── CONTRIBUTING.md           # 贡献指南
├── CHANGELOG.md              # 变更日志
└── LICENSE                   # MIT 协议
```

## 关键设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 架构 | LSP 独立进程 | 避免注释生成阻塞 UI，可复用到其他编辑器 |
| 注释生成 | 规则引擎为主，LLM 可选 | 离线可用、确定性、隐私友好；LLM 仅增强复杂场景 |
| 知识库 | 纯 JSON 数据驱动 | 降低贡献门槛，非开发者也能添加指令模板 |
| 自动注释标记 | `[nasm-commenter]` 前缀 | 可精确识别和批量移除，与用户手写注释区分 |
| MVP 解析 | 行级词法，不做宏展开 | 控制复杂度；v1.x 可集成 `nasm -E` 预处理 |
| 系统调用 ABI | 自动检测 + 可手动指定 | 兼容 Linux/macOS、x86/x64，用户可覆盖 |

## 术语表

| 术语 | 含义 |
|------|------|
| LSP | Language Server Protocol，语言服务器协议 |
| Client | 运行在 VSCode 扩展宿主进程中的客户端代码 |
| Server | 独立进程的语言服务器，执行解析和注释生成 |
| 规则引擎 | 基于知识库模板确定性生成注释的核心模块 |
| 知识库 | `data/` 目录下的 JSON 数据文件集合 |
| 模式匹配 | 识别多指令惯用模式（如函数序言、strlen）的机制 |
| 上下文追踪 | 寄存器常量传播、基本块划分等语义分析 |
| ABI | Application Binary Interface，系统调用参数传递约定 |

## 相关资源

- [LSP 规范](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
- [VSCode Extension API](https://code.visualstudio.com/api)
- [NASM 官方文档](https://www.nasm.us/doc/)
- [x86 Instruction Reference](https://www.felixcloutier.com/x86/)
- [Syscall Table](https://syscalls.w3challs.com/)

## 文档状态

- 版本：2.0（合并精简版，13 篇 → 8 篇）
- 最后更新：2026-08-29
- 维护者：nasm-commenter contributors
