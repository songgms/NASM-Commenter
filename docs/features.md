# NASM Commenter 功能全览

> 当前版本：v0.7.0 · 本文介绍扩展当前已实现的全部功能，数字均为仓库实测值。
> 安装与开发环境见 [README](../README.md)，设计文档见 [00-index](./00-index.md)。

## 一、概述

NASM Commenter 是一个为 NASM 汇编（x86/x64）自动生成注释的 VSCode 扩展，采用 **LSP 双进程架构**（扩展宿主 + 独立语言服务器），也可通过 npm bin 独立运行。核心特点：

- **离线规则引擎为主**：151 条指令语义模板（中英双语，含 60 条 SIMD）、28 个惯用模式、5 套 ABI 寄存器约定、394 条系统调用数据（Linux x64 157 / Linux x86 152 / macOS x64 27 / FreeBSD x64 31 / macOS x86 27），全部数据驱动、Schema 校验、可社区贡献
- **虚拟注释预览为默认工作方式**：注释先以幽灵文字展示、不改文档，确认后一键写入；LLM 结果（如启用）也默认只出现在预览层
- **LLM 为可选增强**：默认关闭，仅在规则引擎无法注释时介入，置信度阈值过滤，失败静默回退

## 二、工作流

```
打开 .asm 文件
  → 虚拟注释预览（幽灵文字，自动刷新，悬停看语义）
  → F2 重命名符号 / Shift+Alt+F 格式化 / 转到定义·查找引用
  → 满意后 Ctrl+; 写入当前行 / 命令写入整个文件
  → 维护：幂等跳过；按生成结果移除；Ctrl+Alt+U 跳到第一个未注释行；或全清
```

知识库模板效果可用 CLI 预览：`node scripts/preview-template.js "mov eax, 123" [--en]`。

## 三、注释引擎能力

**数据驱动模板**：151 条指令按操作数签名（`reg,imm`、`mem,reg`、`reg,reg,reg`…）精确匹配，通配回落 + 条件片段（如 `xor rdi, rdi` → 「rdi 清零 (自身异或)」）；`movsd`/`cmpsd` 与串指令同名时按 xmm 操作数自动路由到 SIMD 条目。中英双语（`language` 配置，英文缺失回落中文）。

**惯用模式识别**（28 个条目，优先于单行注释，整段成组）：

| 模式族 | 效果 |
|--------|------|
| 函数序言（push rbp / mov rbp,rsp / sub rsp,N） | 保存帧指针 / 设置帧指针 / 分配局部空间 |
| 函数结尾（leave ret 或 mov/pop/ret） | 恢复栈帧 / 返回调用者 |
| 批量寄存器保存/恢复（push/pop ×2-4） | 逐条标注保存/恢复 |
| write / exit 系统调用 | 逐行标注调用号与参数 |
| strlen 扫描（repne scasb）、rep movs b/w/d | 串扫描 / 内存块拷贝 |
| cmp + jcc 成对分支（10 种条件） | 「比较…设置标志位」+ 条件语义跳转 |
| 计数循环（mov / dec / jnz） | 初始化 / 递减 / 回跳 |

**上下文追踪**：

- 寄存器常量传播（`mov rax, 1` 体现到后续注释；`add` 更新常量；`xor reg,reg` 清零）
- 别名双向处理：写 `eax` 同步 `rax`；写宽寄存器使子寄存器失效
- **分支汇合合并**：跳转目标处多来源状态合并——同值常量保留、异值置 unknown（轻量化，非完整数据流）
- 栈帧识别：`[rbp-N]` → 「局部变量 N」、`[rbp+N]` → 「函数参数 N」
- **系统调用参数回溯**：`syscall` 行生成「调用 write(1, msg, 13): 写文件」；返回值负值错误码语义已注明
- `call` 后 caller-saved 寄存器失效；非跳转目标标签保持顺流状态

**ABI 自动检测**：`int 0x80`/`bits 32` → Linux x86；`syscall` → Linux x64；`rax ≥ 0x2000000` → macOS。另有 FreeBSD x64 与 macOS x86 数据表（通过 `abi` 配置指定，不自动猜测）。

## 四、预处理器

- **%define**：常量替换（两遍收集，后定义对全文生效；字符串内容不替换）；悬停宏名显示定义值
- **%macro**：简单宏解析与单行宏展开；多行宏调用标注「调用宏 X(args)」（附体行数/参数数）；含嵌套结构的复杂宏给出 Hint 并限制解析
- **%if/%elif/%else/%endif**：配对跟踪，不平衡给出 Warning；条件块内行标注「条件汇编分支不确定, 注释仅供参考」（Hint）
- **%include**：从文档目录解析 `.inc`（深度限 3），合并其中 defines/宏到悬停/补全/符号表（逐行语义替换仍限主文档——见 README 偏差表）

## 五、struc 结构体

- 解析 `struc NAME ... endstruc`，字段 `.field: resX N` 记录偏移与大小（resb/w/d/q = 1/2/4/8）
- 内存操作数与立即数中的 `MyStruct.field` 引用 → 注释追加 `(MyStruct.field, 偏移 N, 大小 M)`
- Hover 字段引用显示偏移、大小与所属结构体总大小

## 六、虚拟注释预览（默认开启）

- 注释以 **Inlay Hint 幽灵文字**显示在行尾，**不修改文档**
- 编辑时自动刷新（按文档版本缓存）；**悬停**查看指令完整语义（类别、标志位、操作数形式）
- 已有真实注释的行不重复预览；`virtual.scope` 可限定仅 `.text`/`.rodata` 代码段
- `切换虚拟注释预览` 命令或 `nasm-commenter.virtual` 开关，切换即时生效
- LLM 启用时，其结果**只出现在预览层**（supplement 默认模式，见第十三节）

## 七、注释写入

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| 注释当前行 | `Ctrl+;` | 光标所在行 |
| 注释选中区域 | `Ctrl+Shift+;` | 选中范围内，对齐列统一 |
| 注释整个文件 | — | 幂等：已写入相同注释的行自动跳过 |
| 注释当前函数 | — | 生成块注释（见下） |

- **两种样式**：`inline`（行尾，`minColumn` 对齐）/ `above`（行上方整行）
- **分号风格**：`semicolonStyle` 支持 `;` 与 `;;`（块注释风格）
- **幂等保护**（0.7.0 重构）：内容一致或已追加 → 跳过；手写注释行默认**保留手写并追加**（`手写 / 自动`）；`protectExistingComments=false` 则已有注释行整体跳过
- **详细模式**：`verbose` 附加标志位与副作用说明；**中英双语**
- **置信度**：规则/模式/上下文固定 1.0；未收录指令兜底注释（0.3）并给出诊断

## 八、函数块注释（模板可配置）

```nasm
; 函数名: add_numbers
; 功能: 函数序言 (标准)
; 参数: rdi, rsi
; 返回: rax = 7
; 破坏的寄存器: eax
```

`annotate.functionTemplate` 可自定义模板（占位符 `{name} {purpose} {args} {return} {clobbered}`，多行 `\n`），适配教学/逆向/内核等场景。

## 九、智能补全

- **命令位置**（行首/标签冒号后）：全部 151 条指令名，附中文语义与说明
- **操作数位置**：寄存器（附位宽）、本文档标签、`%define` 宏常量（含 %include 引入）
- **跳转指令后**：标签优先排序
- **参数位置**：`section .` → 段名；`bits ` → 位数（16/32/64）
- 前缀大小写不敏感过滤；注释内不触发

## 十、实时诊断（Problems 面板，10 类）

| 诊断 | 级别 |
|------|------|
| 未知指令 | Hint |
| 跳转目标未定义 | Warning |
| 未引用标签 | Hint |
| 标签重复定义 | Warning |
| 栈帧失衡（rbp 序言无恢复） | Hint |
| 寄存器无效赋值（写后即覆盖） | Hint |
| 预处理嵌套不匹配（缺 %endmacro/%endif） | Warning |
| 内存-内存操作 | Hint |
| 复杂宏（嵌套结构，语义解析受限） | Hint |
| 条件汇编分支不确定 | Hint |

## 十一、Hover 提示

| 悬停对象 | 内容 |
|----------|------|
| 指令名 | 语义、类别、标志位、操作数形式、注意事项 |
| 寄存器 | ABI 惯例角色 |
| 系统调用号 | 调用名、参数、返回值 |
| `%define` 宏名 | 宏定义值 |
| `Struct.field` | 字段偏移、大小、结构体总大小 |

## 十二、符号导航与格式化

- **转到定义**（F12）：标签、函数、`%define` 常量、宏、结构体
- **查找引用**（Shift+F12）：全部引用位置，含/不含声明可选
- **重命名**（F2）：单文档与已打开文档内批量重命名，NASM 标识符合法性校验
- **文档大纲**：标签/函数/常量/宏一览
- **格式化**（`format.enable` 开启后 Shift+Alt+F）：标签顶格、助记符列 ≥4、操作数与注释按块内最宽对齐；**只动空白不动注释文本**——幂等与移除逻辑不受影响

## 十三、注释维护

| 命令 | 行为 |
|------|------|
| 移除自动注释 | 按规则引擎当前生成结果匹配：一致删整段；`旧 / 新` 追加只剥离追加部分；above 删整行。LLM 增强的注释不参与（无法确定性重生成） |
| 去掉所有注释 | 清除文件内**全部**注释（含手写，模态确认）；字符串内 `;` 不受影响 |
| 跳转到第一个未注释行 | `Ctrl+Alt+U`，快速定位待注释代码 |
| 清空 LLM 缓存 | 清除 LLM 结果缓存 |
| 切换行内/上方 | 样式即时切换 |

需要精确的标记式移除？配置 `marker` 为 `[nasm-commenter] ` 恢复标记模式。

## 十四、可选 LLM 增强

- 提供方：`openai`（任何 OpenAI 兼容端点）/ `ollama`（本地模型）
- **参与策略** `llm.augmentMode`：
  - `supplement`（默认）：LLM 结果**只出现在虚拟注释预览**，写入文件的内容纯规则生成
  - `fallback`：LLM 结果写入文件（注意：该模式下 LLM 行无法自动移除）
- **质量闸门**：`llm.confidenceThreshold`（默认 0.7）以下直接丢弃；失败静默回退规则结果
- **可定制**：`llm.promptTemplate` 自定义 system 提示词（教学/逆向/内核风格）
- **缓存**：内容哈希 + 工作区标识隔离；`清空 LLM 缓存` 命令手动清除
- 隐私：仅发送指令、操作数与前后 5 行上下文，不发送文件路径

## 十五、状态栏与输出面板

- 状态栏：`注释覆盖 X/Y 行 · ABI`，点击跳转第一个未注释行；tooltip 细分规则/LLM/未注释计数
- 输出面板：`NASM Commenter`（客户端）与 `NASM Commenter Server`（服务器日志、LLM 请求延迟/失败/prompt 片段）

## 十六、配置项全表（`nasm-commenter.*`，23 项）

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `enable` | `true` | 总开关 |
| `virtual` | `true` | 虚拟注释预览 |
| `virtual.scope` | `all` | 预览范围：all / textOnly |
| `language` | `zh` | 注释语言 zh/en |
| `style` | `inline` | inline / above |
| `semicolonStyle` | `;` | 分号风格 ; / ;; |
| `minColumn` | `32` | 行内注释最小对齐列 |
| `verbose` | `false` | 详细模式 |
| `autoAnnotate` | `false` | 保存时自动注释整个文件 |
| `protectExistingComments` | `true` | true=手写保留并追加；false=已有注释行跳过 |
| `marker` | `""` | 自动注释标记前缀（默认无） |
| `annotate.functionTemplate` | 内置 | 函数块注释模板 |
| `format.enable` | `false` | 基础格式化 |
| `llm.enabled` | `false` | LLM 增强 |
| `llm.provider` | `openai` | openai / ollama |
| `llm.apiKey` | `""` | API Key |
| `llm.model` | `gpt-4o-mini` | 模型名 |
| `llm.baseUrl` | `https://api.openai.com/v1` | 兼容端点 |
| `llm.timeout` | `30000` | 请求超时（毫秒） |
| `llm.cache` | `true` | 结果缓存（工作区隔离） |
| `llm.augmentMode` | `supplement` | supplement=仅预览；fallback=写入 |
| `llm.confidenceThreshold` | `0.7` | 置信度阈值 |
| `llm.promptTemplate` | `""` | 自定义 system 提示词 |

## 十七、命令清单（11 条）

`annotateLine`（Ctrl+;）· `annotateSelection`（Ctrl+Shift+;）· `annotateFile` · `annotateFunction` · `removeComments` · `stripAllComments` · `gotoFirstUnannotated`（Ctrl+Alt+U）· `annotateBlockHeader` · `toggleInline` · `toggleVirtual` · `clearLlmCache`

## 十八、质量与工程

- **249 个自动化测试**（单元 / 集成 fixtures×7 / 快照三层，Vitest），GitHub Actions CI（Node 18/20）全量验证并产出 VSIX
- 知识库 JSON Schema 校验（`npm run validate:schema`），CLI 预览工具降低贡献门槛
- 代码约束：TypeScript 严格模式、无 `any`、server 无 `console.log`、ESLint 强制

## 十九、版本历程

| 版本 | 里程碑 |
|------|--------|
| 0.1.0 | LSP 架构 + 规则引擎 + 上下文追踪 + 模式匹配 |
| 0.2.0 | 自动补全、实时诊断、状态栏 |
| 0.3.0 | 去除注释标记、标点英文半角、移除机制重设计 |
| 0.4.0 | 虚拟注释预览（Inlay Hint）、去掉所有注释 |
| 0.5.0 | 补全扩展（段名/位数）、虚拟注释缓存与即时刷新 |
| 0.6.0 | 未引用标签诊断、宏常量 Hover、覆盖率统计优化 |
| 0.7.0 | 预处理器（宏/条件/include）、struc 结构体、SIMD +60、符号导航、格式化、LLM 策略 |
