/**
 * 指令语义查询：按 mnemonic + 操作数签名匹配注释模板。
 *
 * 匹配优先级（docs/02 §12.4）：
 * 1. 精确匹配操作数签名
 * 2. 单位置通配（如 `reg,*`、`*,imm`），从最右位置向左尝试
 * 3. 由调用方回落到 description 字段
 */
import type { InstructionEntry, InstructionSemantics, CommentLanguage, OperandsSignature, Operand } from '../types'

/**
 * 助记符路由键：movsd/cmpsd 与串指令同名——当操作数含 xmm 寄存器时
 * 路由到 SIMD 条目（key 加 _fp 后缀），否则保持串指令语义。
 */
export function resolveMnemonicKey(mnemonic: string, operands: Operand[]): string {
  if ((mnemonic === 'movsd' || mnemonic === 'cmpsd') && operands.some((o) => o.register?.startsWith('xmm'))) {
    return mnemonic + '_fp'
  }
  return mnemonic
}

export class InstructionStore {
  private readonly data: InstructionSemantics

  constructor(data: InstructionSemantics) {
    this.data = data
  }

  /** 查询指令条目（大小写不敏感）。 */
  get(mnemonic: string): InstructionEntry | undefined {
    return this.data[mnemonic.toLowerCase()]
  }

  /** 精确签名查询模板。 */
  getTemplate(mnemonic: string, signature: OperandsSignature): string | undefined {
    const entry = this.get(mnemonic)
    return entry?.templates?.[signature]
  }

  /** 精确签名查询英文模板。 */
  getTemplateEn(mnemonic: string, signature: OperandsSignature): string | undefined {
    const entry = this.get(mnemonic)
    return entry?.templates_en?.[signature]
  }

  /** 查询受影响标志位。 */
  getFlags(mnemonic: string): string {
    return this.get(mnemonic)?.flags_affected ?? 'unknown'
  }

  /** 是否收录该指令。 */
  has(mnemonic: string): boolean {
    return mnemonic.toLowerCase() in this.data
  }

  /** 全部已收录的助记符。 */
  getAllMnemonics(): string[] {
    return Object.keys(this.data)
  }

  /**
   * 按语言匹配模板：精确 → 逐位通配（右先）→ 跨语言回落（en 缺失用 zh）。
   * 返回 undefined 表示该指令无任何模板，调用方使用 description 兜底。
   */
  matchTemplate(mnemonic: string, signature: OperandsSignature, language: CommentLanguage): string | undefined {
    const entry = this.get(mnemonic)
    if (!entry) {
      return undefined
    }
    const primary = language === 'en' ? entry.templates_en : entry.templates
    const secondary = language === 'en' ? entry.templates : entry.templates_en
    const hit = this.fromTable(primary, signature) ?? this.fromTable(secondary, signature)
    return hit
  }

  private fromTable(table: Record<string, string> | undefined, signature: OperandsSignature): string | undefined {
    if (!table) {
      return undefined
    }
    if (table[signature] !== undefined) {
      return table[signature]
    }
    const parts = signature.split(',')
    // 逐位通配：从最右位置开始尝试替换为 *
    for (let pos = parts.length - 1; pos >= 0; pos--) {
      const candidate = [...parts]
      candidate[pos] = '*'
      const key = candidate.join(',')
      if (table[key] !== undefined) {
        return table[key]
      }
    }
    return undefined
  }
}
