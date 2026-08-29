# 03 - 注释引擎与上下文追踪

## 第一部分：注释引擎

### 1. 职责与分层

注释引擎是核心编排层，将词法结果、知识库、上下文、模式、LLM 组合为最终注释。

**分层**：
1. **模板层**：单指令模板匹配与渲染（确定性，高置信度）
2. **上下文增强层**：寄存器值追踪、系统调用解析、栈帧识别
3. **模式层**：多指令惯用模式识别（函数序言、strlen 等）
4. **LLM 层**：可选，处理复杂语义（默认关闭）

### 2. 核心接口

```typescript
class CommentEngine {
  constructor(kb: KnowledgeBase, llm?: LLMAdapter)
  commentLine(line: ParsedLine, ctx: LineContext, config: ExtensionConfig): LineCommentResult
  commentRange(lines: ParsedLine[], start: number, end: number, config): CommentRangeResult
  commentDocument(doc: ParsedDocument, config): CommentDocumentResult
  commentFunction(lines: ParsedLine[], start: number, config): CommentFunctionResult
  removeAutoComments(lines: string[]): CommentRangeResult
}

interface LineCommentResult {
  line: number
  comment: string
  source: 'template' | 'pattern' | 'context' | 'llm' | 'fallback'
  confidence: number  // 0.0 - 1.0
  skipped: boolean
  skipReason?: string
}
```

### 3. 单行注释生成流程

```
1. 前置过滤：空行/纯注释/标签行 → skipped
2. 已有注释检查：protectExistingComments && 已有注释 → skipped
3. 模板匹配：kb.getTemplate(mnemonic, signature)
   - 命中 → 渲染变量 → 基础注释
   - 未命中 → fallback: "{mnemonic} {operands}"
4. 上下文增强：
   - 系统调用行（syscall/int 0x80）→ 回溯 rax/eax 值 → 解析调用名和参数
   - 寄存器赋值行 → 记录到上下文
   - 跳转目标 → 标注标签名
5. 置信度计算：template=0.9, pattern=0.85, context-enhanced=0.95, fallback=0.3
6. 格式化：语言/详细级别/对齐/标记
```

### 4. 模板渲染

```typescript
function renderTemplate(template: string, line: ParsedLine, ctx: LineContext): string {
  // 变量替换
  template = template.replace(/\{dst\}/g, line.operands[0]?.raw ?? '')
  template = template.replace(/\{src\}/g, line.operands[1]?.raw ?? '')
  template = template.replace(/\{imm\}/g, getImmediateOperand(line)?.raw ?? '')
  // 上下文变量
  template = template.replace(/\{ctx:reg:(\w+)\}/g, (_, reg) => ctx.registers[reg]?.value ?? reg)
  // 条件片段
  template = evalConditionals(template, line)
  return template
}
```

### 5. 系统调用注释

当遇到 `syscall` 或 `int 0x80`：
1. 从上下文取 `rax`（x64）或 `eax`（x86）的最近已知值
2. `kb.lookupSyscall(abi, number)` 获取定义
3. 回溯参数寄存器（rdi/rsi/rdx/r10/r8/r9）的最近赋值
4. 生成：`调用 write(1, msg, len) 输出字符串`

### 6. 批量注释流程

```
1. 全文解析 → ParsedLine[]
2. 构建基本块（BasicBlock[]）
3. ContextTracker 逐块追踪 → LineContext[]
4. PatternMatcher 扫描 → PatternMatch[]（记录覆盖行）
5. 逐行生成：
   - 行在 PatternMatch 覆盖内 → 使用模式注释（priority 高的优先）
   - 否则 → 单行注释流程
6. 合并去重（同一行只保留最高优先级注释）
7. 已有注释保护
8. 构造 TextEdit[]
```

### 7. 函数块注释

从光标行向上找最近 label，向下找下一个 label 或 `ret`。分析：
- 函数名：label 名
- 功能：模式匹配 + LLM（可选）
- 参数：入口处使用的寄存器（rdi/rsi/rdx 等）
- 返回：`rax` 在 ret 前的赋值
- 破坏的寄存器：函数内被写入的寄存器

### 8. 移除注释

正则匹配 `; \[nasm-commenter\].*$`，移除后清理行尾多余空格。只移除带标记的注释，用户手写注释不受影响。

### 9. 注释格式化

```typescript
interface CommentFormatter {
  format(result: LineCommentResult, line: ParsedLine, config): string
  // 行尾模式: "  ; [nasm-commenter] {comment}"
  // 行上方模式: "{indent}; [nasm-commenter] {comment}\n"
  // 对齐: 计算范围内最长代码行，注释对齐到该列
  // 详细级别: brief=只核心, normal=含参数, detailed=含标志和副作用
}
```

---

## 第二部分：上下文追踪与模式匹配

### 10. 基本块划分

基本块是顺序执行的最大指令序列，入口为标签/跳转目标，出口为跳转/ret/syscall（保守）。

```typescript
interface BasicBlock {
  id: string
  startLine: number
  endLine: number  // inclusive
  predecessors: string[]
  successors: string[]
  isEntry: boolean
}
```

划分算法：
1. 标记所有标签行、条件/无条件跳转目标为块入口
2. 标记跳转/ret 指令为块出口
3. 入口之间的连续指令构成一个块
4. 构建前驱/后继关系

### 11. 寄存器常量传播

对每个基本块，维护寄存器值状态：

```typescript
interface RegisterState {
  value: string | number | undefined  // 已知常量值
  sourceLine: number
  isConstant: boolean
  kind: 'constant' | 'memory-ref' | 'syscall-num' | 'unknown'
}
```

**传播规则**：
- `mov reg, imm` → reg = imm（constant）
- `mov reg, label` → reg = label（memory-ref）
- `xor reg, reg` → reg = 0
- `lea reg, [mem]` → reg = mem 地址
- `add/sub reg, imm` → 若 reg 已知常量则更新值
- `push/pop` → 栈追踪
- 任何不确定操作 → reg = unknown
- 函数调用（call）后 → 所有 caller-saved 寄存器标记 unknown

**别名处理**：写入 `eax` 同时更新 `rax`（低32位），写入 `al` 更新 `ax`/`rax`。

### 12. 栈帧识别

检测标准函数序言：
```
push rbp
mov rbp, rsp
sub rsp, N    → 识别为栈帧，N 为局部变量大小
```
识别后：
- `[rbp-N]` 注释为"局部变量 N"
- `[rbp+N]` 注释为"函数参数 N"
- `leave` 注释为"恢复栈帧"

### 13. 系统调用参数回溯

遇到 `syscall` 时，在当前基本块内向前搜索参数寄存器的最近赋值：
- x64: rax(调用号), rdi(arg1), rsi(arg2), rdx(arg3), r10(arg4), r8(arg5), r9(arg6)
- x86: eax(调用号), ebx(arg1), ecx(arg2), edx(arg3), esi(arg4), edi(arg5), ebp(arg6)

只在同一基本块内回溯（跨块需要数据流分析，MVP 不做）。

### 14. 模式匹配引擎

#### 14.1 模式定义

```typescript
interface PatternDef {
  id: string
  name: string
  description: string
  sequence: string[]  // 助记符序列，支持 "*" 通配
  operandConstraints?: PatternOperandConstraint[]
  comments: string[]  // 与 sequence 等长
  comments_en: string[]
  priority: number  // 越高越优先
  category: 'function' | 'loop' | 'syscall' | 'string' | 'idiom'
}
```

#### 14.2 匹配算法

滑动窗口扫描全文：
1. 对每个起始行，尝试匹配所有模式
2. 比较助记符序列（通配 `*` 匹配任意单条指令）
3. 验证操作数约束
4. 记录匹配（起始行、结束行、模式ID、注释数组）
5. 冲突解决：重叠区域取 priority 高的；同 priority 取更长的

#### 14.3 内置模式（MVP）

| 模式 | 序列 | 注释 |
|------|------|------|
| 函数序言（标准） | push, mov, sub | 保存旧帧/设帧指针/分配局部空间 |
| 函数序言（叶函数） | sub | 分配局部空间 |
| 函数结尾 | leave, ret 或 mov/pop/ret | 恢复栈帧/返回 |
| strlen 循环 | xor, repne, scasb, ... | 计算字符串长度 |
| write 系统调用 | mov×4, syscall | 设置 write 参数/调用 |
| exit 系统调用 | mov, xor, syscall | 设置 exit 参数/调用 |
| 无限循环 | jmp（跳回自身） | 无限循环 |
| 计数循环 | mov, dec, jnz | 计数器递减循环 |

### 15. 上下文追踪接口

```typescript
class ContextTracker {
  buildBlocks(lines: ParsedLine[]): BasicBlock[]
  traceDocument(lines: ParsedLine[]): Map<number, LineContext>
  traceLine(line: ParsedLine, state: RegisterStateMap): LineContext
  getSyscallContext(line: ParsedLine, ctx: LineContext): SyscallContext | undefined
  detectStackFrame(lines: ParsedLine[], start: number): StackFrameInfo | undefined
}

interface LineContext {
  line: number
  blockId: string
  registers: RegisterStateMap
  inFunction: boolean
  functionName?: string
  stackFrame?: StackFrameInfo
  pendingSyscall?: SyscallContext
}
```

### 16. 性能考虑

- 基本块划分 O(n)
- 寄存器传播 O(n)（单遍，块内线性）
- 模式匹配 O(n × m × k)，m=模式数(~10)，k=平均序列长度(~3)，实际很快
- 大文件（>5000行）分批处理，显示进度
- 增量更新：文档变更时仅重建受影响的基本块
