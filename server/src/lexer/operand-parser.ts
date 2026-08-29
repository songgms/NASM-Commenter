/**
 * 操作数解析器：将一个操作数的 Token 序列解析为结构化 Operand。
 *
 * 支持：
 * - 寄存器（含位宽）、立即数（多进制/字符）、标签引用
 * - 内存寻址 [base + index*scale + displacement]、段覆盖 [fs:0x28]、RIP 相对 [rel msg]
 * - 尺寸前缀 byte/word/dword/qword...
 * - 表达式（如 $ - msg）不求值，标记为 expression
 */
import type { Operand, OperandSize, MemoryOperand, Token } from '../types'
import { REGISTERS } from './token-definitions'

/** 位宽 → 尺寸描述。 */
function bitsToSize(bits: number): OperandSize | undefined {
  switch (bits) {
    case 8: return 'byte'
    case 16: return 'word'
    case 32: return 'dword'
    case 64: return 'qword'
    case 80: return 'tword'
    case 128: return 'oword'
    case 256: return 'oword'
    case 512: return 'oword'
    default: return undefined
  }
}

/**
 * 解析立即数原始文本为数值。
 * 支持 0x/0b/0o 前缀、h/b/o/q 后缀、字符 'A'、下划线分隔符。
 */
export function parseImmediate(raw: string): number | undefined {
  let s = raw.trim().replace(/_/g, '')
  if (s.length === 0) {
    return undefined
  }
  // 字符立即数 'A'
  if (s.length >= 3 && s[0] === "'" && s[s.length - 1] === "'") {
    const inner = s.slice(1, -1).replace(/''/g, "'")
    return inner.length === 1 ? inner.charCodeAt(0) : undefined
  }
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  let value: number | undefined
  const lower = s.toLowerCase()
  if (lower.startsWith('0x')) {
    value = parseInt(lower.slice(2), 16)
  } else if (lower.startsWith('0b')) {
    value = parseInt(lower.slice(2), 2)
  } else if (lower.startsWith('0o')) {
    value = parseInt(lower.slice(2), 8)
  } else if (lower.endsWith('h')) {
    value = parseInt(lower.slice(0, -1), 16)
  } else if (lower.endsWith('b')) {
    value = parseInt(lower.slice(0, -1), 2)
  } else if (lower.endsWith('o') || lower.endsWith('q')) {
    value = parseInt(lower.slice(0, -1), 8)
  } else {
    value = parseInt(lower, 10)
  }
  if (value === undefined || Number.isNaN(value)) {
    return undefined
  }
  return negative ? -value : value
}

/**
 * 按顶层逗号分割 token 列表（`[]` 内的逗号不分隔，深度计数）。
 */
export function splitOperandTokens(tokens: Token[]): Token[][] {
  const groups: Token[][] = []
  let current: Token[] = []
  let depth = 0
  for (const tok of tokens) {
    if (tok.type === 'lbracket') {
      depth++
    } else if (tok.type === 'rbracket') {
      depth = Math.max(0, depth - 1)
    }
    if (tok.type === 'comma' && depth === 0) {
      groups.push(current)
      current = []
      continue
    }
    current.push(tok)
  }
  if (current.length > 0 || groups.length > 0) {
    groups.push(current)
  }
  return groups
}

/** 解析方括号内的寻址 tokens。 */
function parseMemory(inner: Token[], size?: OperandSize): MemoryOperand {
  const mem: MemoryOperand = { size }
  let i = 0
  // 段覆盖 [fs:...]
  if (inner[0]?.type === 'segment' && inner[1]?.type === 'colon') {
    mem.segment = inner[0].value.toLowerCase()
    i = 2
  }
  // RIP 相对 [rel msg]
  if (inner[i]?.type === 'identifier' && inner[i].value.toLowerCase() === 'rel') {
    mem.ripRelative = true
    i++
  }
  const rest = inner.slice(i)
  if (rest.length === 0) {
    return mem
  }

  // 按 +/- 分割为 term（term 内部可能是 reg*const）
  type Term = { tokens: Token[]; sign: 1 | -1 }
  const terms: Term[] = []
  let sign: 1 | -1 = 1
  let current: Token[] = []
  for (const tok of rest) {
    if (tok.type === 'plus' || tok.type === 'minus') {
      if (current.length > 0) {
        terms.push({ tokens: current, sign })
        current = []
      }
      sign = tok.type === 'minus' ? -1 : 1
      continue
    }
    current.push(tok)
  }
  if (current.length > 0) {
    terms.push({ tokens: current, sign })
  }

  let dispNumeric: number | undefined
  let dispSymbol: string | undefined
  let symbolSign = 1

  const combineDisplacement = (): number | string | undefined => {
    if (dispSymbol === undefined) {
      return dispNumeric
    }
    if (dispNumeric === undefined || dispNumeric === 0) {
      return symbolSign === -1 && !dispSymbol.startsWith('-') ? `-${dispSymbol}` : dispSymbol
    }
    const joined = `${dispSymbol}${dispNumeric > 0 ? '+' : ''}${dispNumeric}`
    return symbolSign === -1 && !joined.startsWith('-') ? `-${joined}` : joined
  }

  for (const term of terms) {
    const toks = term.tokens
    // reg*const / ident*const
    if (toks.length === 3 && toks[1].type === 'star') {
      const baseTok = toks[0]
      const scaleVal = parseImmediate(toks[2].value)
      const scale = typeof scaleVal === 'number' ? scaleVal : 1
      if (baseTok.type === 'register') {
        if (mem.index === undefined) {
          mem.index = baseTok.value.toLowerCase()
          mem.scale = scale
        }
      } else if (baseTok.type === 'identifier') {
        if (mem.index === undefined) {
          mem.index = baseTok.value.toLowerCase()
          mem.scale = scale
        }
      }
      continue
    }
    if (toks.length === 1) {
      const tok = toks[0]
      if (tok.type === 'register') {
        const reg = tok.value.toLowerCase()
        if (mem.base === undefined) {
          mem.base = reg
        } else if (mem.index === undefined) {
          mem.index = reg
          mem.scale = 1
        }
        continue
      }
      if (tok.type === 'integer') {
        const v = parseImmediate(tok.value)
        if (v !== undefined) {
          dispNumeric = (dispNumeric ?? 0) + term.sign * v
        }
        continue
      }
      if (tok.type === 'identifier') {
        // 符号位移（直接寻址 [var] 或 [var+4]）
        if (dispSymbol === undefined) {
          dispSymbol = tok.value
          symbolSign = term.sign
        } else {
          dispSymbol += term.sign === 1 ? `+${tok.value}` : `-${tok.value}`
        }
        continue
      }
      if (tok.type === 'dollar') {
        dispSymbol = dispSymbol ?? tok.value
        continue
      }
    }
    // 其余组合：保留为符号串
    const text = toks.map((t) => t.value).join('')
    dispSymbol = dispSymbol === undefined ? text : `${dispSymbol}${term.sign === 1 ? '+' : '-'}${text}`
  }

  if (dispSymbol !== undefined || dispNumeric !== undefined) {
    mem.displacement = combineDisplacement()
  }
  return mem
}

/** 依据 token 位置重建原始文本（保留词间空格）。 */
export function rawFromTokens(tokens: Token[]): string {
  let out = ''
  let prevEnd = -1
  for (const t of tokens) {
    if (prevEnd >= 0 && t.start > prevEnd) {
      out += ' '
    }
    out += t.value
    prevEnd = t.end
  }
  return out
}

/**
 * 将一个操作数的 token 序列解析为 Operand。永不抛异常。
 */
export function parseOperandTokens(tokens: Token[]): Operand {
  const list = tokens.filter((t) => t.type !== 'comment')
  const raw = rawFromTokens(list).trim()

  if (list.length === 0) {
    return { type: 'expression', raw: '' }
  }

  // 尺寸前缀
  let size: OperandSize | undefined
  let rest = list
  if (list[0].type === 'size-prefix') {
    size = list[0].value.toLowerCase() as OperandSize
    rest = list.slice(1)
    if (rest.length === 0) {
      return { type: 'expression', raw }
    }
  }

  // 内存操作数
  if (rest.some((t) => t.type === 'lbracket')) {
    const openIdx = rest.findIndex((t) => t.type === 'lbracket')
    const closeIdx = rest.map((t) => t.type).lastIndexOf('rbracket')
    const innerStart = openIdx + 1
    const innerEnd = closeIdx > openIdx ? closeIdx : rest.length
    const inner = rest.slice(innerStart, innerEnd)
    const prefixTokens = rest.slice(0, openIdx)
    let prefixSegment: string | undefined
    if (prefixTokens.length === 1 && prefixTokens[0].type === 'segment') {
      prefixSegment = prefixTokens[0].value.toLowerCase()
    }
    const mem = parseMemory(inner, size)
    if (prefixSegment !== undefined && mem.segment === undefined) {
      mem.segment = prefixSegment
    }
    return { type: 'memory', raw, memory: mem, size }
  }

  // 单 token
  if (rest.length === 1) {
    const tok = rest[0]
    if (tok.type === 'register') {
      const info = REGISTERS.get(tok.value.toLowerCase())
      return {
        type: 'register',
        raw,
        register: tok.value.toLowerCase(),
        registerSize: info ? bitsToSize(info.bits) : undefined
      }
    }
    if (tok.type === 'integer') {
      return { type: 'immediate', raw, immediate: parseImmediate(tok.value) }
    }
    if (tok.type === 'character') {
      return { type: 'immediate', raw, immediate: parseImmediate(tok.value) }
    }
    if (tok.type === 'string') {
      return { type: 'immediate', raw }
    }
    if (tok.type === 'identifier') {
      return { type: 'label', raw, label: tok.value }
    }
    if (tok.type === 'dollar') {
      return { type: 'expression', raw, expressionTokens: [tok.value] }
    }
  }

  // 负立即数：-8 / +4
  if (rest.length === 2 && (rest[0].type === 'minus' || rest[0].type === 'plus') && rest[1].type === 'integer') {
    const value = parseImmediate(rest[1].value)
    const signed = value !== undefined ? (rest[0].type === 'minus' ? -value : value) : undefined
    return { type: 'immediate', raw, immediate: signed }
  }

  // 其余 → 表达式
  return { type: 'expression', raw, expressionTokens: list.map((t) => t.value) }
}

/** 单操作数签名：reg / imm / mem / label / expr。 */
export function operandSignature(operand: Operand): string {
  switch (operand.type) {
    case 'register': return 'reg'
    case 'immediate': return 'imm'
    case 'memory': return 'mem'
    case 'label': return 'label'
    default: return 'expr'
  }
}

/** 操作数签名串：`reg,reg` / `reg,imm` / `mem,reg`；无操作数为空字符串。 */
export function operandsSignature(operands: Operand[]): string {
  return operands.map(operandSignature).join(',')
}
