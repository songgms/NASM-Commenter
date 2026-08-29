/**
 * 缩进与行内注释位置计算。
 */

/** NASM 字符串常量使用的引号。 */
type QuoteChar = "'" | '"'

/**
 * 扫描行文本，返回字符串外第一个 `;` 的下标。
 * NASM 字符串中用连续两个单引号表示转义单引号（''）。
 */
export function findCommentStart(line: string): number {
  let quote: QuoteChar | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote !== null) {
      if (quote === "'" && ch === "'" && line[i + 1] === "'") {
        i++ // 转义的单引号
        continue
      }
      if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }
    if (ch === ';') {
      return i
    }
  }
  return -1
}

/** 行内是否已有注释（字符串中的分号不算）。 */
export function hasExistingComment(line: string): boolean {
  return findCommentStart(line) >= 0
}

/**
 * 移除行尾注释，保留代码部分（去尾随空白）。
 */
export function stripExistingComment(line: string): string {
  const idx = findCommentStart(line)
  const code = idx >= 0 ? line.slice(0, idx) : line
  return code.replace(/[ \t]+$/, '')
}

/** 纯标签行：`foo:` 或 `foo: bar:` 形式（仅标签，无指令）。 */
function isLabelOnly(code: string): boolean {
  const trimmed = code.trim()
  if (trimmed.length === 0) {
    return true
  }
  return /^(?:[a-zA-Z_.$][\w.$?@]*:\s*)+$/.test(trimmed)
}

/**
 * 计算该行行内注释的插入列：
 * - 空行或纯标签行 → 0
 * - 有代码 → max(minColumn, 代码长度 + 2)
 */
export function calculateCommentColumn(line: string, minColumn: number): number {
  const code = stripExistingComment(line)
  if (isLabelOnly(code)) {
    return 0
  }
  return Math.max(minColumn, code.length + 2)
}
