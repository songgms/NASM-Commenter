# 02 - 词法分析器与知识库

## 第一部分：词法分析器

### 1. 设计目标

将单行 NASM 源码转换为结构化 `ParsedLine`。原则：行级分析（不跨行、不展开宏）、容错优先（不抛异常）、零依赖、可测试。

NASM 行结构：`[label:] [prefix] [mnemonic] [operand1, operand2, ...] [; comment]`

### 2. 处理流程

```
原始行 → extractComment（分离注释）→ tokenize（Token[]）
→ classifyLine → extractLabel → extractMnemonic → parseOperands → ParsedLine
```

### 3. 注释分离

扫描字符串状态（单/双引号），字符串外遇到 `;` 即分离注释。NASM 用 `''` 表示转义单引号。

### 4. Tokenize

#### 4.1 识别优先级（高→低）

1. 空白 `\s+`（不存储，仅记录位置）
2. 字符串 `'...'` / `"..."`
3. 十六进制 `0x[0-9a-fA-F]+` / `[0-9a-fA-F]+h`
4. 二进制 `0b[01]+` / `[01]+b`
5. 十进制 `[0-9]+`
6. 字符立即数 `'[char]'`
7. 寄存器（完整单词匹配，大小写不敏感）
8. 尺寸覆盖 `byte/word/dword/qword/...` 后跟空格或 `[`
9. 段覆盖 `cs/ds/es/ss/fs/gs` 后跟 `:`
10. 伪指令（`.` 开头或匹配伪指令表）
11. 标识符 `[a-zA-Z_.$][a-zA-Z0-9_.$?@]*`
12. 运算符 `+ - * / % $`
13. 符号 `[ ] , :`
14. 其他 → Unknown

#### 4.2 寄存器表

内置完整映射：64 位（rax-r15）、32 位（eax-r15d）、16 位（ax-r15w）、8 位（al/ah 等）、段寄存器、rip/eip、rflags、SIMD（xmm/ymm/zmm）、FPU（st0-st7）、MMX（mm0-mm7）。每条记录位宽、类别、父寄存器、ABI 角色。

#### 4.3 立即数解析

```typescript
parseImmediate(raw): 0x前缀→base16, 0b前缀→base2, h后缀→base16, b后缀→base2
纯数字→base10, 'A'→charCode
```

### 5. 行分类与提取

- 过滤空白后为空 → Empty
- 首个有意义 token 是 Comment → CommentOnly
- `Identifier + Colon` → 提取 label
- 剩余首个 token 是 Directive → Directive 行
- 是 Mnemonic/Identifier → Instruction 行
- 助记符不内置完整指令表，第一个非标签标识符默认视为 Mnemonic，伪指令通过内置表识别

### 6. 操作数解析

#### 6.1 分割

按顶层逗号分割（忽略 `[]` 内的逗号），用 depth 计数器。

#### 6.2 单操作数分类

| 类型 | 条件 |
|------|------|
| Register | 单 token 且 type=Register |
| Immediate | 单 token 为 Immediate/String，或非寄存器 Identifier（标签引用） |
| Memory | 包含 `[` `]` |
| Expression | 多 token 含运算符（如 `$ - msg`） |

#### 6.3 内存寻址解析

`[base + index*scale + displacement]`，各部分可选。支持：直接寻址 `[var]`、间接 `[rax]`、基址+位移 `[rbp-8]`、变址*比例 `[rsi*4]`、完整 `[rbp+rdi*8+16]`、RIP 相对 `[rel msg]`、段覆盖 `[fs:0x28]`。

#### 6.4 操作数签名

```typescript
operands.map(op => op.type==='register'?'reg': op.type==='immediate'?'imm': op.type==='memory'?'mem':'expr').join(',')
```
示例：`mov rax, 1` → `"reg,imm"`，`syscall` → `""`。

### 7. 伪指令处理

section/db/dw/dd/dq/equ/global/extern/times/align/bits/%macro/%include/incbin 等，注释模板也放在 instruction-semantics.json 中（category=misc）。

### 8. 错误恢复

永远不抛异常。无法识别的 token 标记 Unknown，整行无法分类则 kind=Unknown，引擎生成 fallback 注释。

---

## 第二部分：指令语义知识库

### 9. 设计理念

纯 JSON 数据驱动，指令语义与代码分离，非开发者可贡献，JSON Schema 校验，中英文双语，O(1) 查询。

### 10. 文件结构

```
data/
├── instruction-semantics.json    # 主指令语义表
├── register-conventions.json     # 寄存器约定
├── patterns.json                 # 多指令模式
└── syscalls/
    ├── linux-x64.json
    └── linux-x86.json
schemas/
├── instruction-schema.json
└── patterns-schema.json
```

### 11. 指令语义表格式

```json
{
  "mov": {
    "summary": "数据传送",
    "description": "将源操作数的值复制到目标操作数",
    "category": "data-transfer",
    "flags_affected": "none",
    "templates": {
      "reg,reg": "将 {src} 的值复制到 {dst}",
      "reg,imm": "将立即数 {imm} 加载到 {dst}",
      "reg,mem": "从内存 {mem} 加载值到 {dst}",
      "mem,reg": "将 {src} 的值存储到内存 {mem}"
    },
    "templates_en": {
      "reg,reg": "copy {src} to {dst}"
    }
  }
}
```

**category 枚举**：data-transfer / arithmetic / logic / control-flow / stack / string / system / fpu / simd / privileged / misc。

### 12. 模板系统

#### 12.1 模板 key 规则

操作数类型签名：`reg`（寄存器）、`imm`（立即数）、`mem`（内存）、`expr`（表达式）、`seg`（段寄存器）。空字符串 `""` 表示无操作数指令。

#### 12.2 模板变量

| 变量 | 含义 | 示例 |
|------|------|------|
| `{dst}` | 目标操作数 | `rax`, `[rbp-8]` |
| `{src}` | 源操作数 | `rbx`, `1` |
| `{imm}` | 立即数（保留原始格式） | `0x2A`, `'A'` |
| `{mem}` | 内存地址表达式 | `[rbp-8]` |
| `{reg}` | 寄存器名 | `rax` |
| `{label}` | 跳转目标标签 | `.loop` |
| `{size}` | 操作数大小 | `byte`, `dword` |

上下文增强变量：`{ctx:reg:rax}`（rax 的已知值）、`{ctx:label}`（当前所属标签）。

#### 12.3 条件片段

```
{if:dst==rsp}调整栈指针{endif}
{if:src==0}{dst} 清零{else}{dst} = {src}{endif}
```
操作符：`==`、`!=`、`contains`。

#### 12.4 匹配优先级

1. 精确匹配操作数签名
2. 目标通配 `reg,*`
3. 源通配 `*,imm`
4. 默认 description 字段

### 13. 知识库加载器

```typescript
class KnowledgeBase {
  load(dataDir): Promise<void>
  lookup(mnemonic): InstructionSemantic | undefined
  getTemplate(mnemonic, signature): string | undefined
  lookupSyscall(abi, number): SyscallDef | undefined
  getRegisterConvention(abi, register): string | undefined
  getPatterns(): PatternDef[]
  setLanguage(lang): void
}
```

启动异步加载，失败时 Server 仍可启动（降级 fallback）。加载后用 JSON Schema 校验，失败条目跳过并记录 warning。

### 14. 系统调用表

```json
{
  "1": { "name": "write", "args": ["fd","buf","count"], "ret": "bytes_written" }
}
```

**ABI 自动检测**：`bits 32`/`int 0x80` → linux-x86；`syscall` → linux-x64（默认）；rax ≥ 0x2000000 → macOS。

### 15. 多指令模式表

```json
{
  "id": "function-prologue-standard",
  "name": "函数序言（标准）",
  "sequence": ["push", "mov", "sub"],
  "comments": ["保存旧栈帧指针", "rbp = rsp", "分配 {imm} 字节局部变量空间"],
  "comments_en": ["save old frame pointer", "rbp = rsp", "allocate {imm} bytes"],
  "priority": 100
}
```

序列支持通配符 `*`，匹配时验证操作数约束（mustBe / sameAs / isRegister 等）。

### 16. 覆盖范围

- **MVP（v0.1）**：约 100 条指令，覆盖手写汇编 95% 场景（数据传送/算术/逻辑/控制流/栈/系统/字符串/伪指令）
- **v1.x**：FPU（~40）、常用 SIMD（~50）
- **v2.x**：AVX 全量、特权指令、虚拟化指令

### 17. 贡献步骤

1. 在 `data/instruction-semantics.json` 添加条目（必须含 summary/description/category/flags_affected/templates）
2. 模板 key 符合操作数签名规则，变量只用预定义集合
3. 运行 `node scripts/validate-schema.js`
4. 添加测试 fixture
5. 提交 PR
