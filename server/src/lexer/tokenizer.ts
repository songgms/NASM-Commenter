/**
 * 核心分词器：逐字符单遍扫描一行 NASM 源码，输出 Token 流。
 *
 * 规则要点：
 * - 字符串（单/双引号）内的 `;` 不是注释；NASM 用 '' 转义单引号
 * - 数字支持：0x 十六进制、h 后缀十六进制、0b/b 后缀二进制、0o/o/q 后缀八进制、十进制、_ 分隔符
 * - `$` 当前地址、`$$` 段起始地址
 * - 寄存器 / 尺寸前缀 / 段覆盖（后跟 `:`）优先于普通标识符
 * - 空白不产出 Token（位置由 start/end 记录）；遇 `;` 剩余全部归入一个 Comment Token
 */
import type { Token, TokenType } from '../types'
import {
  IDENT_PART_RE,
  IDENT_START_RE,
  REGISTERS,
  SEGMENT_REGISTERS,
  SIZE_PREFIXES
} from './token-definitions'

const HEX_DIGIT_RE = /^[0-9a-fA-F_]$/
const DIGIT_RE = /^[0-9_]$/
const BINARY_DIGIT_RE = /^[01_]$/
const OCTAL_DIGIT_RE = /^[0-7_]$/

function isIdentPart(ch: string | undefined): boolean {
  return ch !== undefined && IDENT_PART_RE.test(ch)
}

/** 检查数字后缀场景：suffix 后不能再跟标识符字符（否则 `1010bx` 是标识符）。 */
function suffixEndsNumber(line: string, pos: number): boolean {
  return !isIdentPart(line[pos])
}

/** 跳过空白，返回去除前导空白后的位置。 */
function skipWhitespace(line: string, i: number): number {
  while (i < line.length && /\s/.test(line[i])) {
    i++
  }
  return i
}

/** 数值 token 扫描结果。 */
interface NumberScan {
  type: TokenType
  end: number
}

/**
 * 尝试从 i 位置扫描数值字面量，返回 token 类型与结束位置；
 * 不是数值开头返回 null。原始文本由调用方切片。
 */
function scanNumber(line: string, i: number): NumberScan | null {
  const ch = line[i]
  if (!/[0-9]/.test(ch)) {
    return null
  }
  // 0x / 0X 前缀十六进制
  if (ch === '0' && (line[i + 1] === 'x' || line[i + 1] === 'X')) {
    let j = i + 2
    while (j < line.length && HEX_DIGIT_RE.test(line[j])) {
      j++
    }
    if (j > i + 2 && !isIdentPart(line[j])) {
      return { type: 'integer', end: j }
    }
    // 仅 "0x" 不是数值 → 回落十进制 '0'
  }
  // 0b / 0B 前缀二进制
  if (ch === '0' && (line[i + 1] === 'b' || line[i + 1] === 'B')) {
    let j = i + 2
    while (j < line.length && BINARY_DIGIT_RE.test(line[j])) {
      j++
    }
    if (j > i + 2 && !isIdentPart(line[j])) {
      return { type: 'integer', end: j }
    }
  }
  // 0o / 0O 前缀八进制
  if (ch === '0' && (line[i + 1] === 'o' || line[i + 1] === 'O')) {
    let j = i + 2
    while (j < line.length && OCTAL_DIGIT_RE.test(line[j])) {
      j++
    }
    if (j > i + 2 && !isIdentPart(line[j])) {
      return { type: 'integer', end: j }
    }
  }

  // h 后缀十六进制（必须以数字开头，如 0ABh）
  let j = i
  while (j < line.length && HEX_DIGIT_RE.test(line[j])) {
    j++
  }
  if (j > i && line[j] === 'h' && suffixEndsNumber(line, j + 1)) {
    return { type: 'integer', end: j + 1 }
  }
  // b 后缀二进制（所有数字必须是 0/1）
  let k = i
  while (k < line.length && BINARY_DIGIT_RE.test(line[k])) {
    k++
  }
  if (k > i && line[k] === 'b' && suffixEndsNumber(line, k + 1)) {
    return { type: 'integer', end: k + 1 }
  }
  // o / q 后缀八进制
  let m = i
  while (m < line.length && OCTAL_DIGIT_RE.test(line[m])) {
    m++
  }
  if (m > i && (line[m] === 'o' || line[m] === 'q') && suffixEndsNumber(line, m + 1)) {
    return { type: 'integer', end: m + 1 }
  }
  // 十进制
  let d = i
  while (d < line.length && DIGIT_RE.test(line[d])) {
    d++
  }
  if (d > i && !isIdentPart(line[d])) {
    return { type: 'integer', end: d }
  }
  // 数字后紧跟标识符字符（如 123abc）：只取数字部分为整数
  if (d > i) {
    return { type: 'integer', end: d }
  }
  return null
}

/**
 * 扫描标识符（含寄存器 / 尺寸前缀 / 段覆盖 / 伪指令 / 指令前缀判定）。
 * 段覆盖仅在后跟 `:` 时成立；`%` 开头的预处理伪指令（%define 等）在此消费。
 */
function scanWord(line: string, i: number): Token {
  const start = i
  let j = i
  if (line[j] === '%') {
    j++ // % 前缀单独消费，避免零长度 token
  }
  while (j < line.length && IDENT_PART_RE.test(line[j])) {
    j++
  }
  const word = line.slice(start, j)
  const lower = word.toLowerCase()

  let type: TokenType = 'identifier'
  if (REGISTERS.has(lower)) {
    type = 'register'
    // 段覆盖：段寄存器后跟冒号（允许空白）才作为 segment token
    if (SEGMENT_REGISTERS.has(lower)) {
      let p = j
      while (p < line.length && /\s/.test(line[p])) {
        p++
      }
      if (line[p] === ':') {
        type = 'segment'
      }
    }
  } else if (lower in SIZE_PREFIXES) {
    type = 'size-prefix'
  } else if (lower.startsWith('%')) {
    type = 'directive'
  }

  return { type, value: word, start, end: j }
}

/** 扫描引号字符串（支持 '' 转义单引号 / "" 转义双引号）。 */
function scanString(line: string, i: number): Token | null {
  const quote = line[i]
  const start = i
  let j = i + 1
  while (j < line.length) {
    const ch = line[j]
    if (quote === "'" && ch === "'" && line[j + 1] === "'") {
      j += 2 // 转义的单引号
      continue
    }
    if (quote === '"' && ch === '"' && line[j + 1] === '"') {
      j += 2
      continue
    }
    if (ch === quote) {
      j++
      // value 保留完整字面量（含引号），供伪指令参数与操作数 raw 展示
      const literal = line.slice(i, j)
      const content = line.slice(i + 1, j - 1)
      const type: TokenType = content.length === 1 ? 'character' : 'string'
      return { type, value: literal, start, end: j }
    }
    j++
  }
  // 未闭合字符串：吞到行尾
  const literal = line.slice(i)
  return { type: 'string', value: literal, start, end: line.length }
}

/**
 * 将单行 NASM 源码分词。永不抛异常；无法识别的字符产出 unknown token。
 */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < line.length) {
    i = skipWhitespace(line, i)
    if (i >= line.length) {
      break
    }
    const ch = line[i]

    // 注释：剩余全部归入一个 comment token
    if (ch === ';') {
      tokens.push({ type: 'comment', value: line.slice(i + 1).trim(), start: i, end: line.length })
      break
    }

    // 字符串 / 字符
    if (ch === "'" || ch === '"') {
      tokens.push(scanString(line, i)!)
      i = tokens[tokens.length - 1].end
      continue
    }

    // 数值
    const num = scanNumber(line, i)
    if (num !== null) {
      tokens.push({ type: num.type, value: line.slice(i, num.end), start: i, end: num.end })
      i = num.end
      continue
    }

    // $ 当前地址 / $$ 段起始
    if (ch === '$') {
      let j = i + 1
      while (j < line.length && line[j] === '$') {
        j++
      }
      tokens.push({ type: 'dollar', value: line.slice(i, j), start: i, end: j })
      i = j
      continue
    }

    // 标识符 / 寄存器 / 尺寸前缀 / 段 / 伪指令 / 指令前缀
    if (IDENT_START_RE.test(ch)) {
      const tok = scanWord(line, i)
      tokens.push(tok)
      // 防御：零长度 token 会导致死循环
      i = tok.end > i ? tok.end : i + 1
      continue
    }

    // 单字符符号
    const simple: Record<string, TokenType> = {
      ',': 'comma', ':': 'colon', '[': 'lbracket', ']': 'rbracket',
      '+': 'plus', '-': 'minus', '*': 'star', '/': 'slash'
    }
    if (simple[ch] !== undefined) {
      tokens.push({ type: simple[ch], value: ch, start: i, end: i + 1 })
      i++
      continue
    }

    // 其他 → unknown
    tokens.push({ type: 'unknown', value: ch, start: i, end: i + 1 })
    i++
  }
  return tokens
}
