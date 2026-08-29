/**
 * 操作数类型定义（零运行时依赖，仅类型）。
 */

/** 操作数类别。 */
export type OperandType = 'register' | 'immediate' | 'memory' | 'label' | 'expression'

/** 操作数大小前缀 / 寄存器位宽描述。 */
export type OperandSize = 'byte' | 'word' | 'dword' | 'qword' | 'tword' | 'oword'

/** 内存操作数解析结果：[base + index*scale + displacement]，各部分可选。 */
export interface MemoryOperand {
  /** 基址寄存器，如 `rbp` */
  base?: string
  /** 变址寄存器，如 `rsi` */
  index?: string
  /** 比例因子 1/2/4/8 */
  scale?: number
  /** 位移量：数字或符号名（标签/变量） */
  displacement?: number | string
  /** 段覆盖前缀，如 `fs`（来自 `[fs:0x28]`） */
  segment?: string
  /** 尺寸前缀（`byte [x]` 中的 byte） */
  size?: OperandSize
  /** 是否为 RIP 相对寻址（`[rel msg]`） */
  ripRelative?: boolean
}

/** 单个操作数的结构化表示。 */
export interface Operand {
  type: OperandType
  /** 原始文本（去空白） */
  raw: string
  /** type=register 时的寄存器名（小写） */
  register?: string
  /** type=register 时的位宽描述 */
  registerSize?: OperandSize
  /** type=immediate 时的数值（字符立即数已转为字符码） */
  immediate?: number
  /** type=memory 时的内存寻址解析 */
  memory?: MemoryOperand
  /** 尺寸前缀（`qword [rbp-8]` 中的 qword） */
  size?: OperandSize
  /** type=label 时的标签名 */
  label?: string
  /** type=expression 时的原始 token 序列（不做求值） */
  expressionTokens?: string[]
}
