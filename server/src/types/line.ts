/**
 * 解析行类型定义（零运行时依赖，仅类型）。
 */
import type { Operand } from './operand'

/** 行类别。 */
export type LineKind = 'empty' | 'comment-only' | 'label' | 'instruction' | 'directive' | 'unknown'

/** 指令类别（与知识库 category 枚举一致）。 */
export type InstructionCategory =
  | 'data-transfer'
  | 'arithmetic'
  | 'logic'
  | 'control-flow'
  | 'stack'
  | 'string'
  | 'system'
  | 'fpu'
  | 'simd'
  | 'privileged'
  | 'misc'

/** 单行 NASM 源码的结构化表示。 */
export interface ParsedLine {
  /** 原始行文本（不含行尾换行） */
  raw: string
  /** 0-based 行号 */
  lineNumber: number
  kind: LineKind
  /** 行首标签（不含冒号） */
  label?: string
  /** 助记符（小写），如 `mov`；含前缀时前缀存入 prefixes */
  mnemonic?: string
  /** 指令前缀：rep/repe/repne/lock 等 */
  prefixes?: string[]
  /** 操作数列表（无操作数指令为空数组） */
  operands: Operand[]
  /** 行尾原有注释（不含分号） */
  comment?: string
  /** 伪指令名（小写），如 `section`、`%define` */
  directive?: string
  /** 伪指令参数（原始 token 文本） */
  directiveArgs?: string[]
  /** 指令类别（未知指令为 undefined） */
  instructionType?: InstructionCategory
  /** 行首缩进（用于上方注释对齐） */
  indent?: string
}
