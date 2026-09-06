/**
 * 上下文类型定义（零运行时依赖，仅类型）。
 */
import type { ABI } from './knowledge'

/** 寄存器值的来源种类。 */
export type RegisterValueKind =
  | 'constant'
  | 'memory-ref'
  | 'register-ref'
  | 'syscall-num'
  | 'stack-ref'
  | 'unknown'

/** 单个寄存器的追踪状态。 */
export interface RegisterState {
  /** 已知值：常数、符号名或来源描述 */
  value?: number | string
  kind: RegisterValueKind
  /** 最近一次赋值的行号（0-based） */
  sourceLine: number
  isConstant: boolean
}

/** 寄存器名（小写）→ 状态。 */
export type RegisterStateMap = Record<string, RegisterState>

/** 栈帧信息（识别标准函数序言后生成）。 */
export interface StackFrameInfo {
  /** 序言起始行（push rbp 所在行） */
  startLine: number
  /** 局部变量空间大小（sub rsp, N 中的 N） */
  localsSize: number
  /** 帧基址寄存器，通常为 rbp */
  baseRegister: string
}

/** 系统调用上下文（回溯结果）。 */
export interface SyscallContext {
  abi: ABI
  /** 系统调用号（若已知） */
  number?: number
  /** 系统调用名（查表结果，如 write） */
  name?: string
  /** 参数寄存器回溯结果 */
  args?: Array<{
    register: string
    /** 寄存器最近已知值（常数或符号名），未知为 undefined */
    value?: number | string
    /** 参数含义（查表结果，如 fd） */
    name?: string
  }>
  line: number
}

/** 函数信息。 */
export interface FunctionInfo {
  name: string
  /** 0-based 起始行（标签行） */
  startLine: number
  /** 0-based 结束行（inclusive） */
  endLine: number
  /** 入口处使用的参数寄存器（按 ABI 推断） */
  parameterRegisters: string[]
  /** 局部变量大小（识别序言后填充） */
  localSize?: number
}

/** 循环信息。 */
export interface LoopInfo {
  /** 回跳目标标签行 */
  startLine: number
  /** 回跳指令所在行 */
  endLine: number
  /** 目标标签名 */
  label: string
  /** 计数器寄存器（loop 指令隐含 ecx/rcx） */
  counterRegister?: string
}

/** 结构体字段（struc/endstruc 解析结果）。 */
export interface StructField {
  /** 字段名（不含结构体前缀的点） */
  name: string
  /** 字段偏移（字节） */
  offset: number
  /** 字段大小（字节） */
  size: number
}

/** 结构体定义。 */
export interface StructDef {
  name: string
  fields: StructField[]
  /** 结构体总大小（字节） */
  size: number
}

/** 单行上下文快照。 */
export interface LineContextData {
  line: number
  /** 所在 section 名（如 .text） */
  section?: string
  inFunction: boolean
  functionName?: string
  /** 该行执行前的寄存器状态 */
  registers: RegisterStateMap
  stackFrame?: StackFrameInfo
  /** 该行为 syscall/int 0x80 时的回溯结果 */
  syscall?: SyscallContext
  /** 该行属于某个已识别循环时给出 */
  loop?: LoopInfo
  /** 全文档结构体表（共享引用） */
  structs?: Map<string, StructDef>
}
