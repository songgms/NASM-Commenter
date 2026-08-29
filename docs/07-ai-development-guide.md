# AI 开发教程：NASM Commenter

> **文档性质**：本文件是给 AI 协作者（包括自动化 Agent、LLM 编程助手）的可执行开发手册。
> 阅读完本文档后，你应当能独立完成任意模块的开发，无需额外询问。
> 如有冲突，以本文档 > `docs/` 下设计文档 > 代码注释 > 通用实践 的优先级为准。

---

## 0. 你必须先做的事

在写任何代码之前，按顺序完成以下读取：

1. 读 `README.md` — 理解项目目标和功能范围
2. 读 `docs/01-architecture.md` — 理解进程模型和模块划分
3. 读 `docs/00-index.md` — 根据你要开发的模块，精读对应设计文档
4. 读 `server/src/types/index.ts` 及相关类型文件 — 理解已有类型定义
5. 读 `data/instruction-semantics.json` 中至少 5 条指令 — 理解数据格式
6. 读 `package.json` — 理解可用脚本和依赖版本

**禁止**：不读设计文档就开始写代码。**禁止**：自行发明与设计文档冲突的接口。

---

## 1. 项目核心约束（不可违反）

### 1.1 架构约束

| 约束 | 说明 | 违反后果 |
|------|------|----------|
| client/server 分离 | 注释生成逻辑**只能**在 `server/`，client 只做命令转发和编辑应用 | 架构破坏，LSP 无法独立测试 |
| knowledge 数据驱动 | 新增指令支持**优先**改 JSON，不改代码；只有 JSON 表达不了的才写 handler | 代码膨胀，社区无法贡献 |
| handlers 无状态 | 每个 handler 函数签名为 `(line, context, config) => CommentResult`，不持有内部状态 | 无法并行处理，测试困难 |
| types 零依赖 | `types/` 下文件**禁止** import 任何运行时代码（只 import 其他 type 文件） | 循环依赖，前后端无法共享 |
| LLM 可选 | LLM 模块通过 `LLMAdapter` 接口注入；未配置时引擎**必须**完全走规则路径，不报错 | 用户无 API Key 时扩展不可用 |
| 注释标记 | 所有自动生成的注释必须以 `[nasm-commenter]` 开头（行内）或包含该标记（上方） | 无法批量移除自动注释 |

### 1.2 代码约束

- **语言**：TypeScript，严格模式（`strict: true`），**禁止** `any`，必须用 `unknown` + 类型守卫
- **格式**：2 空格缩进，单引号，无分号，行尾无空格（ESLint 会检查）
- **命名**：
  - 文件：kebab-case（`comment-engine.ts`，不是 `CommentEngine.ts`）
  - 类型/接口：PascalCase，接口不加 `I` 前缀（`CommentEngine`，不是 `ICommentEngine`）
  - 函数/变量：camelCase
  - 常量：UPPER_SNAKE_CASE
- **导出**：每个模块用 `index.ts` 统一导出，外部只从 `index.ts` import，不深入内部文件
- **函数长度**：单个函数不超过 50 行；超过则拆分为子函数
- **注释**：公共 API 必须有 JSDoc，内部函数如逻辑非平凡也需注释

### 1.3 数据约束

- 知识库 JSON 文件**禁止**在代码中硬编码指令语义，必须从 `data/` 加载
- 修改 JSON 后必须运行 `node scripts/validate-schema.js` 验证
- 新增系统调用必须同时更新 `linux-x64.json` 和 `linux-x86.json`（如适用）

---

## 2. 开发环境准备

```bash
# 1. 安装依赖
npm install

# 2. 验证知识库数据（必须通过）
node scripts/validate-schema.js

# 3. 确认 TypeScript 编译无错（骨架阶段）
npx tsc --noEmit -p tsconfig.json

# 4. 可用脚本
npm run build          # webpack 生产构建
npm run watch          # webpack 监听模式
npm run lint           # ESLint 检查
npm run test:unit      # 单元测试
npm run test:integration # 集成测试
npm run test:snapshot  # 快照测试
npm run test           # 全部测试
```

---

## 3. 逐步开发指令

按以下顺序开发。每一步完成后必须运行对应验证，通过后才能进入下一步。

### 阶段 1：基础设施

#### 3.1.1 `server/src/utils/logger.ts`

**目标**：分级日志工具，输出到 stderr（LSP 服务器 stdout 是协议通道，**禁止**用 console.log）。

**必须实现**：
```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(msg: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
}

export function createLogger(level: LogLevel): Logger
```

**关键要求**：
- 用 `console.error` 输出（stderr），**禁止** `console.log`
- 格式：`[YYYY-MM-DD HH:mm:ss] [LEVEL] message`
- 低于设定级别的日志不输出
- 默认级别 `warn`

**验证**：
```bash
npx tsc --noEmit -p server/tsconfig.json
```

#### 3.1.2 `server/src/utils/indent.ts`

**目标**：计算注释应该插入的列位置。

**必须实现**：
```typescript
export function calculateCommentColumn(line: string, minColumn: number): number
export function hasExistingComment(line: string): boolean
export function stripExistingComment(line: string): string
```

**关键要求**：
- NASM 注释以 `;` 开头
- `calculateCommentColumn`：如果行内已有代码，返回代码后第一个合适位置（至少 `minColumn`）；如果是空行或纯标签，返回 0
- `hasExistingComment`：检测行内是否有 `;`（注意字符串中的分号，NASM 字符串用单引号/双引号）
- `stripExistingComment`：移除行尾注释，保留代码

#### 3.1.3 `server/src/utils/hash.ts`

**目标**：简单字符串哈希，用于 LLM 缓存键。

**必须实现**：
```typescript
export function hashString(str: string): string  // 返回 16 进制哈希
```

**关键要求**：用 FNV-1a 或 djb2 算法，不引入外部依赖。

#### 3.1.4 `server/src/knowledge/loader.ts`

**目标**：启动时加载所有 JSON 数据文件并校验。

**必须实现**：
```typescript
export interface KnowledgeData {
  instructions: InstructionSemantics
  patterns: CommentPattern[]
  syscalls: {
    'linux-x64': SyscallTable
    'linux-x86': SyscallTable
  }
  registers: RegisterConventions
}

export function loadKnowledge(dataDir?: string): KnowledgeData
```

**关键要求**：
- 数据目录默认 `path.join(__dirname, '../../data')`（webpack 打包后路径会变，需用 `vscode-languageserver` 的 `Files` 工具或运行时参数）
- 加载失败时抛 `Error`，包含具体文件名和原因
- 加载后调用验证逻辑（可复用 `scripts/validate-schema.js` 的核心逻辑，提取为共享函数）

#### 3.1.5 `server/src/knowledge/instruction-store.ts`

**目标**：按指令名 + 操作数签名查询注释模板。

**必须实现**：
```typescript
export class InstructionStore {
  constructor(data: InstructionSemantics)
  get(mnemonic: string): InstructionEntry | undefined
  getTemplate(mnemonic: string, operandSignature: string): string | undefined
  getTemplateEn(mnemonic: string, operandSignature: string): string | undefined
  getFlags(mnemonic: string): string
  has(mnemonic: string): boolean
  getAllMnemonics(): string[]
}
```

**关键要求**：
- mnemonic 大小写不敏感（内部转小写）
- `operandSignature` 格式如 `reg,reg`、`reg,imm`、`mem,reg`，与 JSON 中 key 一致
- 找不到模板时返回 `undefined`，**不抛异常**
- 操作数签名生成逻辑在 `operand-parser.ts`，这里只做查询

#### 3.1.6 `server/src/knowledge/syscall-store.ts`

```typescript
export type ABI = 'linux-x64' | 'linux-x86' | 'macos-x64'

export class SyscallStore {
  constructor(tables: Record<string, SyscallTable>)
  get(abi: ABI, number: number): SyscallInfo | undefined
  getByName(abi: ABI, name: string): SyscallInfo | undefined
  has(abi: ABI, number: number): boolean
}
```

#### 3.1.7 `server/src/knowledge/register-store.ts`

```typescript
export class RegisterStore {
  constructor(data: RegisterConventions)
  getParameterRegister(abi: ABI, index: number): string | undefined
  getReturnRegister(abi: ABI): string
  getSyscallNumberRegister(abi: ABI): string
  getCallingConvention(abi: ABI): CallingConvention
}
```

#### 3.1.8 `server/src/knowledge/pattern-store.ts`

```typescript
export class PatternStore {
  constructor(patterns: CommentPattern[])
  match(sequence: string[]): MatchedPattern | undefined
  // sequence 是最近 N 条指令的 mnemonic 数组
  // 返回最长匹配的模式（按 priority 排序，同优先级取最长 sequence）
  getAll(): CommentPattern[]
}
```

**阶段 1 完成验证**：
```bash
npx tsc --noEmit -p server/tsconfig.json
node scripts/validate-schema.js
```

---

### 阶段 2：词法分析

#### 3.2.1 `server/src/lexer/token-definitions.ts`

**目标**：定义所有 Token 类型和常量。

**必须包含**：
```typescript
export enum TokenType {
  // 空白与注释
  Whitespace = 'whitespace',
  Comment = 'comment',
  // 标识符
  Label = 'label',           // 以 : 结尾
  Identifier = 'identifier', // 指令名、符号名
  Register = 'register',     // 寄存器
  // 字面量
  Integer = 'integer',       // 十进制/十六进制/二进制/八进制
  String = 'string',         // 引号字符串
  Character = 'character',   // 字符常量 'A'
  // 操作符
  Comma = 'comma',           // ,
  Colon = 'colon',           // :
  LParen = 'lparen',         // [
  RParen = 'rparen',         // ]
  Plus = 'plus',             // +
  Minus = 'minus',           // -
  Star = 'star',             // *
  Slash = 'slash',           // /
  // 伪指令标记
  Directive = 'directive',   // %define, %macro 等
  // 其他
  Unknown = 'unknown',
  EOL = 'eol',
}

export const REGISTERS_16 = new Set(['ax','cx','dx','bx','sp','bp','si','di',...])
export const REGISTERS_32 = new Set(['eax','ecx',...])
export const REGISTERS_64 = new Set(['rax','rcx',...])
export const SEGMENT_REGISTERS = new Set(['cs','ds','es','fs','gs','ss'])
export const INSTRUCTIONS = new Set([...]) // 从 instruction-semantics.json 的 key 加载
```

**关键要求**：
- 寄存器识别大小写不敏感
- 数字格式：`123`（十进制）、`0x7B`/`7Bh`（十六进制）、`0b111`/`111b`（二进制）、`0o173`/`173o`（八进制）
- NASM 中 `$` 表示当前地址，`$$` 表示段起始地址，需识别为特殊 token

#### 3.2.2 `server/src/lexer/tokenizer.ts`

**目标**：逐字符扫描一行，输出 Token 数组。

**必须实现**：
```typescript
export interface Token {
  type: TokenType
  value: string
  start: number  // 列位置（0-based）
  end: number    // 排他结束位置
}

export function tokenizeLine(line: string): Token[]
```

**关键要求**：
- 只处理单行（NASM 语句不跨行，除非有 `%` 续行，初期可忽略续行）
- 遇到 `;` 立即停止，剩余全部作为 Comment token
- 字符串中的 `;` 不当作注释开始
- 寄存器优先于标识符匹配（`eax` 是 Register，不是 Identifier）
- 性能：单次扫描 O(n)，不回溯
- **必须**对以下情况写测试：空行、纯注释、`mov eax, 123`、`mov [rbp-8], rax`、`add rax, rbx ; comment`、字符串 `db 'hello;world'`

#### 3.2.3 `server/src/lexer/operand-parser.ts`

**目标**：将操作数 Token 序列解析为结构化 Operand。

**必须实现**：
```typescript
export type OperandType = 'register' | 'immediate' | 'memory' | 'label' | 'expression'

export interface Operand {
  type: OperandType
  raw: string
  register?: string           // type=register 时
  immediate?: number | bigint // type=immediate 时
  memory?: MemoryOperand      // type=memory 时
  label?: string              // type=label 时
  size?: 'byte' | 'word' | 'dword' | 'qword' | 'tword' | 'oword' // 内存操作数大小前缀
}

export interface MemoryOperand {
  base?: string       // 基址寄存器
  index?: string      // 变址寄存器
  scale?: number      // 比例因子 1/2/4/8
  displacement?: number | string // 偏移量（数字或标签名）
  segment?: string    // 段覆盖前缀
}

export function parseOperand(tokens: Token[]): Operand
export function operandSignature(operand: Operand): string
// 返回 'reg' | 'imm' | 'mem' | 'label' | 'expr'
export function operandsSignature(operands: Operand[]): string
// 返回 'reg,reg' / 'reg,imm' / 'mem,reg' 等
```

**关键要求**：
- 内存操作数解析 `[base + index*scale + disp]`，各部分可选
- 大小前缀 `byte`/`word`/`dword`/`qword` 在 `[` 之前
- 立即数支持 `$`（当前地址）和表达式（初期标记为 expression，不计算）
- `operandSignature` 是知识库匹配的关键，必须与 JSON 中的 key 格式一致

#### 3.2.4 `server/src/lexer/line-parser.ts`

**目标**：将 Token 流组装为 ParsedLine。

**必须实现**：
```typescript
export interface ParsedLine {
  raw: string
  lineNumber: number
  label?: string           // 行首标签（不带冒号）
  mnemonic?: string        // 指令名（小写）
  operands: Operand[]
  comment?: string         // 原有注释（不含分号）
  directive?: string       // 伪指令名（%define 等）
  directiveArgs?: string[] // 伪指令参数
  isEmpty: boolean
  isCommentOnly: boolean
  instructionType?: InstructionCategory
}

export function parseLine(line: string, lineNumber: number): ParsedLine
```

**关键要求**：
- 标签可以单独一行（`loop_start:`），也可以与指令同行（`start: mov eax, 1`）
- 伪指令以 `%` 开头，如 `%define`、`%macro`、`%include`
- `mnemonic` 统一转小写
- 无法识别的指令 mnemonic 仍保留原值，`instructionType` 为 `undefined`

#### 3.2.5 `server/src/lexer/preprocessor.ts`（简化版）

**目标**：处理 `%define` 常量替换。`%macro` 和 `%include` 初期返回原始行，标记为未展开。

```typescript
export interface PreprocessorState {
  defines: Map<string, string>
}
export function preprocessLine(line: string, state: PreprocessorState): string
```

**阶段 2 完成验证**：
```bash
npm run test:unit -- lexer
npx tsc --noEmit -p server/tsconfig.json
```

---

### 阶段 3：注释引擎核心

#### 3.3.1 `server/src/engine/template-renderer.ts`

**目标**：将注释模板中的变量替换为实际值。

```typescript
export interface TemplateVariables {
  dst?: string    // 目标操作数描述
  src?: string    // 源操作数描述
  imm?: string    // 立即数
  mem?: string    // 内存地址描述
  label?: string  // 标签名
  reg?: string    // 寄存器名
  syscall?: string // 系统调用名
  count?: string  // 重复次数
  size?: string   // 操作数大小
}

export function renderTemplate(template: string, vars: TemplateVariables): string
export function describeOperand(operand: Operand): string
// 返回人类可读的操作数描述，如 "寄存器 rax"、"内存 [rbp-8]"、"立即数 42"
```

**关键要求**：
- 变量格式 `{name}`，未提供的变量保留原样（不报错）
- `describeOperand` 是核心：寄存器→`寄存器 rax`，立即数→`立即数 42`，内存→`内存 [rbp-8]`，标签→`标签 foo`
- 中文描述用"寄存器/立即数/内存/标签"前缀，英文用 "register/immediate/memory at/label"

#### 3.3.2 `server/src/engine/comment-formatter.ts`

**目标**：将注释文本格式化为最终插入的字符串。

```typescript
export type CommentStyle = 'inline' | 'above'
export type CommentLanguage = 'zh' | 'en'

export interface FormatOptions {
  style: CommentStyle
  language: CommentLanguage
  minColumn: number
  tabSize: number
  marker: string  // 默认 '[nasm-commenter] '
}

export function formatComment(line: ParsedLine, comment: string, options: FormatOptions): FormattedComment
export interface FormattedComment {
  text: string           // 注释文本（含分号和标记）
  insertLine: number     // 插入行（above 模式时为 lineNumber，inline 时为同一行）
  insertColumn: number   // 插入列（inline 模式）
  isNewline: boolean     // 是否需要新行（above 模式）
}
```

**关键要求**：
- inline 模式：在代码后插入 `; [nasm-commenter] 注释内容`
- above 模式：在当前行上方插入一行，缩进与代码对齐，`; [nasm-commenter] 注释内容`
- 已有注释时：inline 模式追加（`; 原注释 [nasm-commenter] 新注释`），above 模式仍在上方新行
- 注释列对齐：至少 `minColumn`，如果代码超过则代码后加 2 空格

#### 3.3.3 `server/src/engine/deduplicator.ts`

```typescript
export function shouldSkip(line: ParsedLine, generatedComment: string): boolean
// 如果行内已有相同内容的 [nasm-commenter] 注释，返回 true
export function extractAutoComments(line: string): string[]
// 提取行中所有 [nasm-commenter] 标记的注释内容
```

#### 3.3.4 handlers（10 个文件）

每个 handler 的统一模式：

```typescript
import type { ParsedLine } from '../lexer/line-parser'
import type { DocumentContext } from '../context/document-context'
import type { CommentConfig } from '../types/config'
import type { CommentResult } from '../types/comment'
import type { InstructionStore } from '../knowledge/instruction-store'
import { renderTemplate, describeOperand } from '../engine/template-renderer'

export function handleMov(
  line: ParsedLine,
  context: DocumentContext,
  stores: { instructions: InstructionStore },
  config: CommentConfig
): CommentResult | null {
  // 1. 从 line 取 mnemonic 和 operands
  // 2. 生成操作数签名
  // 3. 从 InstructionStore 查模板
  // 4. 准备 TemplateVariables
  // 5. renderTemplate
  // 6. 如有上下文增强（如寄存器追踪），补充信息
  // 7. 返回 CommentResult
}
```

**CommentResult 结构**（在 `types/comment.ts` 中已定义，确认后使用）：
```typescript
export interface CommentResult {
  comment: string           // 中文注释
  commentEn?: string        // 英文注释
  confidence: number        // 0-1，规则引擎固定 1.0，LLM 可低于 1.0
  source: 'rule' | 'llm' | 'pattern'
  detail?: string           // 详细注释（verbose 模式）
}
```

**各 handler 要点**：

| 文件 | 指令 | 特殊处理 |
|------|------|----------|
| `data-transfer.ts` | mov, xchg, push, pop, lea, movzx, movsx | lea 需描述有效地址计算；push/pop 需说明栈变化 |
| `arithmetic.ts` | add, sub, inc, dec, neg, cmp, mul, imul, div, idiv | cmp 说明比较结果影响标志位；mul/div 说明隐含寄存器 |
| `logic.ts` | and, or, xor, not, test, shl, shr, sar, rol, ror | xor reg,reg 识别为清零；移位说明移位位数 |
| `control-flow.ts` | jmp, jcc(je/jne/...), call, ret, loop | 条件跳转说明跳转条件（如"相等时跳转"）；call/ret 说明栈变化 |
| `system.ts` | syscall, int, nop, hlt, cpuid, cli, sti | syscall 需查 SyscallStore 获取调用名和参数说明 |
| `string.ts` | movsb, movsd, cmpsb, scasb, lodsb, stosb, rep, repe, repne | 说明方向标志、隐含寄存器、rep 前缀的重复次数 |
| `stack.ts` | enter, leave | enter 说明栈帧大小；leave 等价于 mov rsp,rbp + pop rbp |
| `pseudo.ts` | section, global, extern, equ, times, align, bits | section 说明段类型；equ 说明常量定义 |
| `data-define.ts` | db, dw, dd, dq | 说明数据类型和初始值 |
| `label.ts` | （非指令，处理标签行） | 函数入口标签添加函数注释（如"; 函数入口：foo"） |

**handler 路由** `handlers/index.ts`：
```typescript
const HANDLER_MAP: Record<string, HandlerFunction> = {
  mov: handleMov, add: handleAdd, ...
}
export function getHandler(mnemonic: string): HandlerFunction | null
export function listSupportedMnemonics(): string[]
```

#### 3.3.5 `server/src/engine/comment-engine.ts`

**目标**：核心编排器。

```typescript
export class CommentEngine {
  constructor(
    private stores: KnowledgeStores,
    private config: CommentConfig
  )

  annotateLine(line: ParsedLine, context: DocumentContext): CommentResult | null
  annotateDocument(lines: ParsedLine[], context: DocumentContext): Map<number, CommentResult>
  // 返回 lineNumber -> CommentResult 的映射
}
```

**处理流程**：
1. 如果行是空行/纯注释/已有相同自动注释 → 返回 null
2. 尝试模式匹配（`PatternStore.match`），如果匹配到多指令模式，用模式注释
3. 否则查 handler，调用对应 handler
4. handler 返回 null 时，用 `InstructionStore` 的 defaultComment 兜底
5. 应用 `deduplicator` 检查
6. 返回结果

**阶段 3 完成验证**：
```bash
npm run test:unit -- engine
npm run test:unit -- handlers
npx tsc --noEmit -p server/tsconfig.json
```

---

### 阶段 4：上下文与模式

#### 3.4.1 `server/src/utils/abi-detector.ts`

```typescript
export function detectABI(lines: ParsedLine[]): ABI
// 检测逻辑：
// 1. 有 syscall 指令 + 64位寄存器(rax/rsp) → linux-x64 或 macos-x64
// 2. 有 int 0x80 → linux-x86
// 3. 有 int 0x80 + 32位寄存器 → linux-x86
// 4. section .text + 默认 → linux-x64（最常见）
// 5. 无法确定 → linux-x64（默认）
```

#### 3.4.2 `server/src/context/document-context.ts`

```typescript
export class DocumentContext {
  constructor(lines: ParsedLine[], abi: ABI)
  getFunctionAt(lineNumber: number): FunctionInfo | null
  getSectionAt(lineNumber: number): string
  getLabelAt(lineNumber: number): string | null
  getRegisterValue(register: string, beforeLine: number): string | null
  // 返回寄存器在指定行之前最近一次赋值的来源描述
  getSyscallContext(lineNumber: number): SyscallContext | null
  // 如果当前行是 syscall，回溯找到 rax/eax 赋值，返回系统调用信息
  getLoopAt(lineNumber: number): LoopInfo | null
  abi: ABI
}
```

#### 3.4.3 `server/src/context/function-tracker.ts`

识别函数边界：
- 函数入口：全局标签（`global foo` + `foo:`）或符合命名约定的标签
- 函数结束：`ret` 指令或下一个函数入口
- 函数参数：根据 ABI 从寄存器读取（x64: rdi, rsi, rdx, rcx, r8, r9）

#### 3.4.4 `server/src/context/register-tracker.ts`

数据流追踪（简化版）：
- 记录每条 `mov`/`lea`/算术指令对寄存器的赋值
- 支持 `mov rax, rbx` → rax 的来源是 rbx
- 支持 `mov rax, 1` → rax 的来源是立即数 1
- 不做跨分支的复杂数据流，只做线性追踪

#### 3.4.5 `server/src/context/loop-tracker.ts`

识别循环：
- `loop` 指令 + 目标标签
- 条件跳转向后跳转到之前的标签
- 记录循环体范围和计数器寄存器

#### 3.4.6 `server/src/context/pattern-matcher.ts`

滑动窗口匹配 `patterns.json` 中的模式：
- 从当前行向前看最多 5 行
- 匹配指令名序列 + 操作数约束
- 匹配成功后，模式中的注释模板逐行应用

**阶段 4 完成验证**：
```bash
npm run test:unit -- context
npx tsc --noEmit -p server/tsconfig.json
```

---

### 阶段 5：LSP 服务器

#### 3.5.1 `server/src/lsp/code-action.ts`

实现 `textDocument/codeAction`：
- 对有指令的行提供 "添加注释" action
- 对有 `[nasm-commenter]` 注释的行提供 "移除自动注释" action
- 对选中区域提供 "注释选中区域" action

#### 3.5.2 `server/src/lsp/hover.ts`

实现 `textDocument/hover`：
- 悬停在指令名上：显示指令功能、影响标志位、操作数模板
- 悬停在寄存器上：显示寄存器用途（根据 ABI）
- 悬停在系统调用号上：显示系统调用名和参数

#### 3.5.3 `server/src/server.ts`

```typescript
import { createConnection, TextDocuments, ProposedFeatures } from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'

export class NASMLanguageServer {
  private connection = createConnection(ProposedFeatures.all)
  private documents = new TextDocuments(TextDocument)
  private engine: CommentEngine | null = null
  private contexts = new Map<string, DocumentContext>()

  start(): void {
    this.connection.onInitialize(this.onInitialize.bind(this))
    this.connection.onInitialized(this.onInitialized.bind(this))
    this.documents.onDidChangeContent(this.onDidChangeContent.bind(this))
    this.connection.onCodeAction(this.onCodeAction.bind(this))
    this.connection.onHover(this.onHover.bind(this))
    // 自定义请求
    this.connection.onRequest('nasm-commenter/annotateFile', this.onAnnotateFile.bind(this))
    this.connection.onRequest('nasm-commenter/annotateSelection', this.onAnnotateSelection.bind(this))
    this.connection.onRequest('nasm-commenter/removeComments', this.onRemoveComments.bind(this))
    this.documents.listen(this.connection)
    this.connection.listen()
  }
}
```

**关键要求**：
- `onInitialize` 中加载知识库，失败则返回错误
- 文档变更时增量更新 `DocumentContext`（全量重算可接受，汇编文件通常不大）
- 自定义请求的请求/响应格式必须与 `docs/02-lsp-protocol.md` 一致

#### 3.5.4 `server/src/index.ts`

```typescript
import { NASMLanguageServer } from './server'
new NASMLanguageServer().start()
```

**阶段 5 完成验证**：
```bash
npm run build
# 在 VSCode 中按 F5 启动 Extension Host，打开 .asm 文件测试
```

---

### 阶段 6：VSCode 客户端

#### 3.6.1 `client/src/config.ts`

读取 `package.json` 中定义的配置项：
```typescript
export function getConfig(): CommentConfig
export function onConfigChange(callback: () => void): void
```

配置项（在 `package.json` 的 `contributes.configuration` 中已定义）：
- `nasm-commenter.enable`：总开关
- `nasm-commenter.language`：注释语言 zh/en
- `nasm-commenter.style`：inline/above
- `nasm-commenter.minColumn`：注释最小列
- `nasm-commenter.verbose`：详细模式
- `nasm-commenter.autoAnnotate`：输入时自动注释
- `nasm-commenter.llm.enabled`：LLM 增强开关
- `nasm-commenter.llm.provider`：openai/ollama
- `nasm-commenter.llm.apiKey`：API Key（secret 存储）
- `nasm-commenter.llm.model`：模型名
- `nasm-commenter.llm.baseUrl`：自定义端点
- `nasm-commenter.llm.timeout`：超时毫秒
- `nasm-commenter.llm.cache`：是否缓存

#### 3.6.2 命令实现（6 个）

每个命令的统一模式：
```typescript
import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'

export async function annotateFile(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) return
  if (editor.document.languageId !== 'nasm') {
    vscode.window.showWarningMessage('当前文件不是 NASM 汇编文件')
    return
  }
  // 1. 发送请求到 server
  const result = await client.sendRequest('nasm-commenter/annotateFile', {
    textDocument: { uri: editor.document.uri.toString() }
  })
  // 2. 应用 WorkspaceEdit
  const edit = new vscode.WorkspaceEdit()
  for (const item of result.edits) {
    edit.insert(editor.document.uri, item.position, item.text)
  }
  await vscode.workspace.applyEdit(edit)
  // 3. 状态栏提示
  vscode.window.setStatusBarMessage(`已注释 ${result.count} 行`, 3000)
}
```

**命令列表**：
| 命令 ID | 文件 | 功能 |
|---------|------|------|
| `nasm-commenter.annotateFile` | `annotate-file.ts` | 注释整个文件 |
| `nasm-commenter.annotateSelection` | `annotate-selection.ts` | 注释选中区域 |
| `nasm-commenter.annotateLine` | `annotate-line.ts` | 注释当前行 |
| `nasm-commenter.removeComments` | `remove-comments.ts` | 移除所有自动注释 |
| `nasm-commenter.toggleInline` | `toggle-inline.ts` | 切换 inline/above |
| `nasm-commenter.annotateOnType` | （内置，非命令） | 输入时自动触发 |

#### 3.6.3 `client/src/status-bar.ts`

状态栏项显示：
- 扩展启用状态
- 当前文件注释行数
- ABI 检测结果（如 `Linux x64`）

#### 3.6.4 `client/src/extension.ts`

```typescript
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node'
import { registerCommands } from './commands'
import { createStatusBar } from './status-bar'

let client: LanguageClient

export function activate(context: vscode.ExtensionContext): void {
  // 1. 启动 LSP 客户端
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'))
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6009'] } }
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'nasm' }],
    synchronize: { configurationSection: 'nasm-commenter' }
  }
  client = new LanguageClient('nasm-commenter', 'NASM Commenter', serverOptions, clientOptions)
  client.start()

  // 2. 注册命令
  registerCommands(context, client)

  // 3. 创建状态栏
  createStatusBar(context, client)
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
```

**阶段 6 完成验证**：
```bash
npm run build
# F5 启动 Extension Host
# 打开 .asm 文件，测试所有命令
```

---

### 阶段 7：LLM 增强（可选）

#### 3.7.1 `server/src/llm/adapter.ts`

```typescript
export interface LLMRequest {
  instruction: string
  operands: string[]
  context: string      // 前后 5 行代码
  abi: string
  language: 'zh' | 'en'
}

export interface LLMResponse {
  comment: string
  confidence: number
}

export interface LLMAdapter {
  readonly name: string
  generate(request: LLMRequest): Promise<LLMResponse>
  isAvailable(): boolean
}
```

#### 3.7.2 `server/src/llm/prompt-builder.ts`

构建 Prompt，要求 LLM 只返回注释文本，不解释。
系统提示词模板：
```
你是一个汇编语言注释助手。根据给定的 NASM 汇编指令和上下文，生成一行简洁的中文注释。
要求：
1. 注释不超过 30 个汉字
2. 说明指令做了什么，而不是指令名翻译
3. 如果是系统调用，说明调用功能
4. 只返回注释文本，不要加引号或分号
5. 如果无法确定，返回空字符串
```

#### 3.7.3 `server/src/llm/cache.ts`

以 `hashString(instruction + operands.join(',') + context + abi + language)` 为键，缓存 LLM 结果。TTL 可配置。

#### 3.7.4 适配器实现

- `openai-adapter.ts`：OpenAI Chat Completions API，兼容任何 OpenAI 兼容端点
- `ollama-adapter.ts`：本地 Ollama API（`http://localhost:11434/api/generate`）

**集成到引擎**：在 `CommentEngine.annotateLine` 中，如果规则引擎返回 null 且 LLM 启用，则调用 LLM。LLM 失败时静默降级为规则结果，不报错。

---

### 阶段 8：测试

#### 测试文件规范

- 测试文件与源文件同目录结构镜像：`server/src/lexer/tokenizer.ts` → `tests/unit/lexer/tokenizer.test.ts`
- 测试框架：Vitest（在 package.json 中配置）
- 每个测试文件至少覆盖：正常输入、边界输入、错误输入

#### 必须有的测试用例

**lexer/tokenizer.test.ts**：
- 空行 → 空 token 数组（或只有 EOL）
- 纯注释行 → 一个 Comment token
- `mov eax, 123` → 正确识别指令、寄存器、逗号、立即数
- `mov [rbp-8], rax` → 正确识别内存操作数
- `add rax, rbx ; 加法` → 代码 + 注释分离
- `db 'hello;world'` → 字符串中的分号不当作注释
- `mov eax, 0x7B` → 十六进制立即数
- `mov eax, 1010b` → 二进制立即数

**handlers/data-transfer.test.ts**：
- `mov eax, 123` → "将立即数 123 加载到 eax"
- `mov [rbp-8], rax` → "将 rax 的值存储到内存 [rbp-8]"
- `lea rax, [rbx+rcx*4]` → "计算有效地址 rbx+rcx*4 并加载到 rax"
- `push rax` → "将 rax 压入栈"
- `pop rax` → "从栈弹出值到 rax"

**engine/comment-engine.test.ts**：
- 已有相同注释时跳过
- 空行返回 null
- 未知指令用兜底注释

**integration/engine.integration.test.ts**：
- 用 `tests/integration/fixtures/` 下的 .asm 文件，端到端生成注释，与预期对比

#### Fixture 规范

每个 fixture 是一个 `.asm` 文件，同名 `.expected.asm` 是注释后的预期输出。
```
tests/integration/fixtures/
├── hello-world.asm
├── hello-world.expected.asm
├── function-call.asm
└── function-call.expected.asm
```

---

## 4. 常见陷阱（必须避免）

| 陷阱 | 说明 | 正确做法 |
|------|------|----------|
| stdout 输出日志 | LSP 服务器 stdout 是 JSON-RPC 通道，console.log 会破坏协议 | 用 console.error 或 logger 输出到 stderr |
| 同步文件读取阻塞 | 服务器启动时读 JSON 用同步读取可接受，但运行时禁止 | 启动时加载到内存，运行时只查内存 |
| 忘记转小写 | 指令名 `MOV` 和 `mov` 是同一个 | 所有 mnemonic 比较前转小写 |
| 字符串中的分号 | `db 'a;b'` 中的 `;` 不是注释 | tokenizer 中进入字符串状态后忽略分号 |
| 内存操作数解析 | `[rbp-8]` 不是两个操作数 | 方括号内全部是一个 memory operand |
| 注释列计算 | 代码很长时注释列会超出 | 超过 minColumn 时代码后 +2 空格，不强制对齐 |
| 大文件性能 | 全量重算上下文在大文件中慢 | 汇编文件通常 < 1000 行，全量可接受；超过时再优化增量 |
| LLM 阻塞 | LLM 请求慢，不能阻塞规则路径 | LLM 作为 fallback，超时后返回规则结果 |
| 配置未同步 | client 改了配置但 server 不知道 | LSP `synchronize.configurationSection` 自动同步，server 用 `workspace/configuration` 请求 |
| 编辑冲突 | 用户正在编辑时应用注释编辑 | 用 `WorkspaceEdit` + version 检查，冲突时提示用户 |

---

## 5. 提交前检查清单

每次提交代码前，**必须**全部通过：

- [ ] `npm run lint` 无错误
- [ ] `npx tsc --noEmit` 无错误
- [ ] `node scripts/validate-schema.js` 通过
- [ ] `npm run test:unit` 全部通过
- [ ] 新增代码有对应测试
- [ ] 新增公共 API 有 JSDoc
- [ ] 没有 `any` 类型（ESLint 会检查）
- [ ] 没有 `console.log`（用 logger）
- [ ] 没有硬编码的指令语义（用 knowledge 数据）
- [ ] 自动注释包含 `[nasm-commenter]` 标记
- [ ] README 或 CHANGELOG 更新（如有功能变更）

---

## 6. 数据贡献指南（修改 JSON 时）

### 新增指令模板

1. 打开 `data/instruction-semantics.json`
2. 添加新条目：
```json
"指令名小写": {
  "summary": "简短中文名",
  "description": "详细功能说明",
  "category": "arithmetic",
  "flags_affected": "CF,ZF,SF,OF",
  "templates": {
    "reg,reg": "将 {src} 加到 {dst}",
    "reg,imm": "将立即数 {imm} 加到 {dst}"
  },
  "templates_en": {
    "reg,reg": "add {src} to {dst}",
    "reg,imm": "add immediate {imm} to {dst}"
  }
}
```
3. 运行 `node scripts/validate-schema.js`
4. 如果指令需要特殊逻辑（JSON 表达不了），在对应 handler 文件中添加处理

### 新增模式

1. 打开 `data/patterns.json`
2. 添加模式：
```json
{
  "id": "模式-id",
  "name": "模式名称",
  "sequence": ["xor", "xor"],
  "comments": ["清零 {dst}", "清零 {dst}"],
  "comments_en": ["zero {dst}", "zero {dst}"],
  "priority": 60,
  "description": "连续 xor 清零"
}
```
3. 运行验证脚本

### 新增系统调用

在 `data/syscalls/linux-x64.json` 或 `linux-x86.json` 中添加：
```json
"123": {
  "name": "syscall_name",
  "description": "功能说明",
  "args": ["参数1说明", "参数2说明"]
}
```

---

## 7. 快速参考：类型查找表

开发时需要类型定义，从以下文件查找：

| 你需要的类型 | 文件 |
|-------------|------|
| Token, TokenType | `server/src/types/token.ts` |
| Operand, OperandType | `server/src/types/operand.ts` |
| ParsedLine | `server/src/types/line.ts` |
| InstructionSemantics, InstructionEntry | `server/src/types/knowledge.ts` |
| CommentPattern, SyscallTable | `server/src/types/knowledge.ts` |
| CommentResult, FormattedComment | `server/src/types/comment.ts` |
| DocumentContext, FunctionInfo | `server/src/types/context.ts` |
| CommentConfig, LLMConfig | `server/src/types/config.ts` |
| AnnotateFileRequest, AnnotateFileResponse | `server/src/types/lsp.ts` |

所有类型从 `server/src/types/index.ts` 统一导入：
```typescript
import type { ParsedLine, CommentResult, CommentConfig } from '../types'
```

---

## 8. 遇到问题时

1. **设计文档没有覆盖的情况**：在 `docs/` 对应文档中补充设计，再实现。不要先写代码再补文档。
2. **类型定义缺失**：在 `types/` 对应文件中添加，然后从 `index.ts` 导出。
3. **知识库数据不足**：优先补充 JSON，只有 JSON 表达不了的才写代码。
4. **测试失败**：先检查测试预期是否正确，再检查实现。不要修改测试来迎合错误实现。
5. **性能问题**：先 profile 确认瓶颈，再优化。汇编文件小，过早优化无意义。
6. **不确定某个设计决策**：查看 `docs/01-architecture.md` 的"设计决策"部分，仍不确定则保持简单实现并注释 TODO。

---

*本文件是 AI 开发的权威操作手册。任何与本文档冲突的实现都应被修正。*
