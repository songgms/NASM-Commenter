/**
 * 模式存储：多指令惯用模式的序列匹配与冲突解决。
 *
 * 序列支持 `*` 通配任意单条指令；匹配时验证操作数约束；
 * 冲突解决：重叠区域取 priority 高的，同 priority 取更长序列。
 */
import type { CommentPattern, ParsedLine } from '../types'

/** 一次模式匹配命中的记录。 */
export interface MatchedPattern {
  pattern: CommentPattern
  /** 起始行（0-based，inclusive） */
  startLine: number
  /** 结束行（0-based，inclusive） */
  endLine: number
  /** 匹配到的各行 ParsedLine（与 sequence 一一对应） */
  lines: ParsedLine[]
}

/** 检查单条指令的操作数是否满足约束。 */
function satisfiesConstraints(
  pattern: CommentPattern,
  matched: ParsedLine[]
): boolean {
  if (!pattern.operandConstraints || pattern.operandConstraints.length === 0) {
    return true
  }
  for (const c of pattern.operandConstraints) {
    const line = matched[c.index]
    const op = line?.operands[c.operand]
    if (!op) {
      return false
    }
    if (c.mustBe !== undefined && op.raw.toLowerCase() !== c.mustBe.toLowerCase()) {
      return false
    }
    if (c.isRegister && op.type !== 'register') {
      return false
    }
    if (c.isImmediate && op.type !== 'immediate') {
      return false
    }
    if (c.sameAs) {
      const [i, o] = c.sameAs
      const other = matched[i]?.operands[o]
      if (!other || other.raw.toLowerCase() !== op.raw.toLowerCase()) {
        return false
      }
    }
  }
  return true
}

/** 助记符序列匹配（支持 `*` 通配）。 */
function sequenceMatches(sequence: string[], mnemonics: string[]): boolean {
  if (sequence.length !== mnemonics.length) {
    return false
  }
  return sequence.every((s, i) => s === '*' || s === mnemonics[i])
}

export class PatternStore {
  private readonly patterns: CommentPattern[]
  /** 按序列长度索引，加速匹配 */
  private readonly byLength: Map<number, CommentPattern[]> = new Map()

  constructor(patterns: CommentPattern[]) {
    this.patterns = patterns
    for (const p of patterns) {
      const list = this.byLength.get(p.sequence.length) ?? []
      list.push(p)
      this.byLength.set(p.sequence.length, list)
    }
  }

  /** 全部模式。 */
  getAll(): CommentPattern[] {
    return [...this.patterns]
  }

  /**
   * 匹配助记符序列（如最近 N 条指令），返回匹配的模式（同长度内按 priority 最高）。
   */
  match(sequence: string[]): CommentPattern | undefined {
    const candidates = this.byLength.get(sequence.length) ?? []
    const hits = candidates.filter((p) => sequenceMatches(p.sequence, sequence))
    if (hits.length === 0) {
      return undefined
    }
    hits.sort((a, b) => b.priority - a.priority)
    return hits[0]
  }

  /**
   * 全文滑动窗口扫描（输入为含指令的行列表），返回互不重叠的匹配集合。
   * 冲突解决：priority 高者优先；同 priority 取更长序列。
   */
  scanDocument(instructionLines: ParsedLine[]): MatchedPattern[] {
    const candidates: MatchedPattern[] = []
    for (let start = 0; start < instructionLines.length; start++) {
      for (const [len, patterns] of this.byLength) {
        if (start + len > instructionLines.length) {
          continue
        }
        const window = instructionLines.slice(start, start + len)
        const mnemonics = window.map((l) => l.mnemonic ?? '')
        for (const p of patterns) {
          if (!sequenceMatches(p.sequence, mnemonics)) {
            continue
          }
          if (!satisfiesConstraints(p, window)) {
            continue
          }
          candidates.push({
            pattern: p,
            startLine: window[0].lineNumber,
            endLine: window[window.length - 1].lineNumber,
            lines: window
          })
        }
      }
    }
    // 冲突解决：priority 降序，同 priority 序列长者优先
    candidates.sort((a, b) => {
      if (b.pattern.priority !== a.pattern.priority) {
        return b.pattern.priority - a.pattern.priority
      }
      return b.pattern.sequence.length - a.pattern.sequence.length
    })
    const accepted: MatchedPattern[] = []
    for (const cand of candidates) {
      const overlaps = accepted.some(
        (a) => cand.startLine <= a.endLine && cand.endLine >= a.startLine
      )
      if (!overlaps) {
        accepted.push(cand)
      }
    }
    return accepted
  }
}
