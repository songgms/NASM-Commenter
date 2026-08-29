# 05 - 测试策略与构建 CI

## 第一部分：测试策略

### 1. 三层测试体系

| 层级 | 工具 | 运行环境 | 目标 |
|------|------|----------|------|
| 单元测试 | Mocha + Chai | 纯 Node | 模块独立正确性 ≥90% |
| 集成测试 | Mocha + Chai | 纯 Node | 端到端注释流程 |
| 快照测试 | Mocha + 自定义 | 纯 Node | 典型示例版本化对比 |
| 扩展测试 | @vscode/test-electron | VSCode Electron | 客户端真实集成 |

### 2. 测试目录结构

```
test/
├── suite/
│   ├── index.ts                  # Mocha 入口
│   ├── unit/
│   │   ├── lexer/ (tokenizer, operand-parser, line-parser)
│   │   ├── engine/ (template-matcher, context-tracker, pattern-matcher, syscall-resolver, comment-formatter)
│   │   ├── knowledge/ (knowledge-base, schema-validation)
│   │   └── llm/ (prompt-builder, response-parser)
│   ├── integration/ (comment-line, comment-range, comment-document, remove-comments, lsp-handlers)
│   ├── snapshot/ (examples)
│   └── vscode/ (extension)
├── fixtures/
│   ├── asm/ (hello-world, strlen, fibonacci, function-calls, syscalls, loops, macros, edge-cases)
│   ├── expected/ (*.comments.json)
│   └── context/ (basic-blocks, register-state)
└── mocks/ (mock-connection, mock-llm-provider)
```

### 3. 单元测试要点

**Tokenizer**：各类 Token 识别、大小写不敏感、注释分离、字符串处理、错误恢复。
**OperandParser**：寄存器（8/16/32/64位）、立即数（十进制/十六进制/二进制/字符）、内存寻址（完整 SIB）、表达式、无效操作数。
**LineParser**：标签/指令/伪指令/空行/注释行、多操作数分割（括号内逗号）、指令前缀。
**TemplateMatcher**：精确匹配、降级匹配、变量渲染、条件片段、未知指令兜底。
**ContextTracker**：基本块划分、常量传播（线性/分支/循环）、系统调用参数回溯、栈帧识别、别名写入。
**PatternMatcher**：已知模式命中、操作数约束、优先级冲突、部分匹配不误报。
**CommentFormatter**：中英文切换、详细级别过滤、对齐列计算、标记添加、已有注释保护。
**KnowledgeBase**：Schema 验证、模板变量合法、指令无重复、系统调用号无冲突、加载性能 <100ms。
**LLM**：Prompt 构建、响应解析（JSON/Markdown/fallback）、隐私过滤、Mock Provider 全流程。

### 4. 集成测试

对每个 fixture 执行完整流程并与期望结果对比：

```typescript
it('should comment hello-world.asm correctly', async () => {
  const doc = Lexer.parseDocument(await loadFixture('hello-world.asm'))
  const result = new CommentEngine().commentDocument(doc, defaultConfig)
  const expected = await loadExpectedComments('hello-world.comments.json')
  expect(result.results).to.deep.equal(expected)
})
```

LSP Handler 测试使用 MockConnection 验证消息处理。移除注释测试验证只移除 `[nasm-commenter]` 标记的注释。

### 5. 快照测试

维护 8 个代表性汇编示例，每次运行生成注释与已提交快照对比。注释逻辑有意变更时 `npm run test:snapshot -- --update`，CI 中禁止 `--update`。

| 示例 | 覆盖场景 |
|------|----------|
| hello-world | 数据传送 + write/exit 系统调用 |
| strlen | 循环 + repne scasb 模式 |
| fibonacci | 函数调用 + 递归 + 栈帧 |
| syscalls | 多种系统调用 + 参数回溯 |
| loops | 多种循环 + 条件跳转 |
| macros | NASM 宏（跳过宏定义行） |
| edge-cases | 空行、纯注释、长行、特殊字符 |

### 6. VSCode 扩展测试

使用 `@vscode/test-electron` 在真实 VSCode 中测试激活、命令注册、编辑应用。CI 中通过 `xvfb-run` 无头运行。

### 7. Fixture 规范

每个 `.asm` fixture 头部含元信息注释：
```nasm
; @fixture: hello-world
; @description: 基本的 Linux x64 hello world 程序
; @abi: linux-x64
; @expected-comments: 8
```

期望注释 JSON：
```json
{
  "fixture": "hello-world",
  "config": { "commentLanguage": "zh", "detailLevel": "normal" },
  "lines": [{ "line": 8, "comment": "rax = 1 (系统调用号: write)" }]
}
```

### 8. 覆盖率目标

| 模块 | 行覆盖率 |
|------|----------|
| Lexer | ≥ 90% |
| CommentEngine | ≥ 85% |
| ContextTracker | ≥ 80% |
| KnowledgeBase | ≥ 95% |
| LLM | ≥ 70% |
| Client | ≥ 60% |

使用 `c8` 生成报告：`npm run test:coverage`。

### 9. 测试辅助

```typescript
// 快速解析并注释
function parseAndComment(code, config?): LineCommentResult[]
// 断言某行注释包含指定文本
function assertLineComment(results, line, expectedSubstring)
// Mock LLM Provider（固定响应）
class MockLLMProvider implements LLMAdapter { ... }
```

---

## 第二部分：构建与 CI

### 10. 工具链

| 工具 | 用途 | 版本 |
|------|------|------|
| Node.js | 运行时 | ≥ 18 |
| TypeScript | 类型检查/编译 | 5.x |
| Webpack | 双入口打包 | 5.x |
| ESLint | 代码检查 | 8.x |
| Mocha | 测试框架 | 10.x |
| c8 | 覆盖率 | 最新 |
| vsce | 扩展打包 | 最新 |

### 11. NPM Scripts

```json
{
  "vscode:prepublish": "npm run build:prod",
  "build": "npm run build:client && npm run build:server",
  "build:client": "tsc -p client/tsconfig.json",
  "build:server": "tsc -p server/tsconfig.json",
  "build:prod": "webpack --mode production",
  "watch": "webpack --mode development --watch",
  "lint": "eslint client/src server/src --ext .ts",
  "lint:fix": "eslint client/src server/src --ext .ts --fix",
  "test": "npm run test:unit && npm run test:integration",
  "test:unit": "mocha --config test/.mocharc.unit.json",
  "test:integration": "mocha --config test/.mocharc.integration.json",
  "test:snapshot": "mocha --config test/.mocharc.snapshot.json",
  "test:vscode": "node ./test/run-vscode-tests.js",
  "test:coverage": "c8 npm test",
  "package": "vsce package",
  "publish": "vsce publish",
  "validate:schema": "node scripts/validate-schema.js"
}
```

### 12. Webpack 配置要点

双入口（client + server），`target: 'node'`，`vscode` 设为 external（由宿主提供），ts-loader 处理 `.ts`。开发模式生成 sourcemap，生产模式启用压缩不生成 sourcemap。

### 13. 打包 vsix

`npm run package` 生成 `nasm-commenter-<version>.vsix`。`.vscodeignore` 排除 test/docs/scripts/schemas/src/*.ts/*.map，保留 client/out、server/out、data、language-configuration.json、README、LICENSE、CHANGELOG。

知识库数据通过 `package.json` 的 `files` 字段随扩展分发，Server 运行时用 `context.asAbsolutePath()` 定位。

### 14. GitHub Actions CI

#### 14.1 主工作流 ci.yml

触发：push 到 main/develop，PR 到 main。

矩阵：Node 18.x + 20.x。

步骤：checkout → setup-node（npm cache）→ `npm ci` → lint → validate:schema → build → test:unit → test:integration → test:snapshot → coverage（仅 Node 20）。

独立 job：VSCode 扩展测试（`xvfb-run -a npm run test:vscode`），依赖 build-and-test 完成。

#### 14.2 发布工作流 release.yml

触发：tag `v*`。步骤：完整构建测试 → `vsce package` → 创建 GitHub Release（上传 vsix）→ 发布到 VSCode Marketplace（`VSCE_PAT`）→ 发布到 Open VSX（`OVSX_PAT`）。

#### 14.3 知识库验证工作流

PR 改动 `data/**` 或 `schemas/**` 时触发，仅运行 `validate:schema` 和覆盖率检查，便于数据贡献快速反馈。

### 15. 版本管理

SemVer：`MAJOR.MINOR.PATCH`。MAJOR=不兼容架构变更，MINOR=新功能（新指令/模式/Provider），PATCH=bug修复/知识库扩充。

发布流程：develop 开发 → 更新 CHANGELOG → 更新 package.json 版本 → 合并 main → 打 tag → CI 自动发布。

CHANGELOG 遵循 Keep a Changelog：Added/Changed/Fixed/Deprecated/Removed/Security。

### 16. 发布渠道

- **VSCode Marketplace**：主渠道，需 Azure DevOps PAT，Publisher ID `nasm-commenter`
- **Open VSX**：兼容 VSCodium/GitPod，需 Eclipse 基金会 PAT
- **GitHub Release**：每次发布上传 vsix，支持手动安装

### 17. 开发环境

前置：Node ≥18、npm ≥9、VSCode、Git。

```bash
git clone <fork> nasm-commenter && cd nasm-commenter
npm install && npm run build
```

调试：F5 启动 "Run Extension"，新窗口打开 .asm 测试。客户端断点在 `client/src/`，服务端断点在 `server/src/`（Attach to Server，端口 6009）。Compound 配置 "Client + Server" 同时调试两端。

### 18. 代码质量

- **ESLint**：`@typescript-eslint/recommended` + 自定义规则（禁 any、要求显式返回类型），CI 中 lint 失败阻止合并
- **Prettier**（可选）：semi、singleQuote、tabWidth 4、printWidth 100
- **TypeScript 严格模式**：strict、noImplicitAny、strictNullChecks、noUnusedLocals、noUnusedParameters

### 19. 依赖管理

生产依赖：`vscode-languageclient`、`vscode-languageserver`、`vscode-languageserver-textdocument`。

开发依赖：TypeScript、Webpack、Mocha、ESLint、vsce 等。

Dependabot 每周检查 npm 依赖更新，最多同时开 5 个 PR。
