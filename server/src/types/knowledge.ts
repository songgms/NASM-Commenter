/**
 * 知识库数据类型定义（零运行时依赖，仅类型）。
 */
import type { InstructionCategory } from './line'

/** 操作数签名，如 `reg,reg`、`reg,imm`、`mem,reg`；无操作数指令为空字符串。 */
export type OperandsSignature = string

/** 单条指令语义条目（对应 instruction-semantics.json 中的一个 value）。 */
export interface InstructionEntry {
  /** 简短中文名，如「数据传送」 */
  summary: string
  /** 详细功能说明 */
  description: string
  /** 指令类别 */
  category: InstructionCategory
  /** 受影响的标志位，如 `CF,ZF,SF,OF` 或 `none` */
  flags_affected: string
  /** 操作数签名 → 中文注释模板 */
  templates?: Record<string, string>
  /** 操作数签名 → 英文注释模板 */
  templates_en?: Record<string, string>
  /** 详细模式（verbose）附加说明 */
  detail?: string
  /** 操作数说明（Hover 展示用） */
  operands_note?: string
}

/** 指令语义表：mnemonic（小写）→ 条目。 */
export type InstructionSemantics = Record<string, InstructionEntry>

/** 模式操作数约束。 */
export interface PatternOperandConstraint {
  /** 序列中第几条指令（0-based） */
  index: number
  /** 该指令的第几个操作数（0-based） */
  operand: number
  /** 精确匹配（原始文本，如 `rbp`） */
  mustBe?: string
  /** 与序列中另一条指令的某操作数相同：[index, operand] */
  sameAs?: [number, number]
  /** 必须是寄存器 */
  isRegister?: boolean
  /** 必须是立即数 */
  isImmediate?: boolean
}

/** 多指令惯用模式（对应 patterns.json 中的一项）。 */
export interface CommentPattern {
  id: string
  name: string
  description: string
  /** 助记符序列，支持 `*` 通配任意单条指令 */
  sequence: string[]
  /** 操作数约束（可选） */
  operandConstraints?: PatternOperandConstraint[]
  /** 与 sequence 等长的中文注释模板数组 */
  comments: string[]
  /** 与 sequence 等长的英文注释模板数组 */
  comments_en: string[]
  /** 越高越优先；冲突时同优先级取更长序列 */
  priority: number
  category: 'function' | 'loop' | 'syscall' | 'string' | 'idiom'
}

/** 单个系统调用定义。 */
export interface SyscallInfo {
  name: string
  description?: string
  /** 参数名列表，如 ["fd", "buf", "count"] */
  args?: string[]
  /** 返回值说明 */
  ret?: string
}

/** 系统调用表：十进制编号字符串 → 定义。 */
export type SyscallTable = Record<string, SyscallInfo>

/** ABI 种类。 */
export type ABI = 'linux-x64' | 'linux-x86' | 'macos-x64' | 'freebsd-x64' | 'macos-x86'

/** 调用约定。 */
export interface CallingConvention {
  /** 函数参数寄存器（按参数序） */
  parameterRegisters: string[]
  /** 返回值寄存器 */
  returnRegister: string
  /** 系统调用号寄存器 */
  syscallNumberRegister: string
  /** 系统调用参数寄存器（按参数序） */
  syscallArgRegisters: string[]
  /** 被调用者保存寄存器 */
  calleeSaved: string[]
  /** 调用者保存寄存器（call 后视为失效） */
  callerSaved: string[]
}

/** 寄存器约定表（对应 register-conventions.json）。 */
export interface RegisterConventions {
  [abi: string]: {
    callingConvention: CallingConvention
    /** 寄存器名 → 惯例说明（Hover 展示用） */
    registerRoles?: Record<string, string>
  }
}

/** 知识库全部数据（loader 输出）。 */
export interface KnowledgeData {
  instructions: InstructionSemantics
  patterns: CommentPattern[]
  syscalls: Partial<Record<ABI, SyscallTable>>
  registers: RegisterConventions
}
