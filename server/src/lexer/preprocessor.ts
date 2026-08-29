/**
 * 简化版预处理器：仅处理 %define 常量替换。
 * %macro / %include 初期返回原始行不展开（v1.x 可集成 `nasm -E`）。
 */
export interface PreprocessorState {
  defines: Map<string, string>
}

export function createPreprocessorState(): PreprocessorState {
  return { defines: new Map() }
}

/** 在字符串外做整词替换（避免破坏字符串内容）。 */
function replaceOutsideStrings(line: string, replace: (s: string) => string): string {
  let result = ''
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === "'" || ch === '"') {
      result += ch
      i++
      while (i < line.length) {
        const c = line[i]
        result += c
        i++
        // 连续两个相同引号 = 转义引号（'' 或 ""）
        if (c === ch && line[i] === ch) {
          result += line[i]
          i++
          continue
        }
        if (c === ch) {
          break
        }
      }
      continue
    }
    // 标识符整词
    if (/[a-zA-Z_.$?@]/.test(ch)) {
      let j = i
      while (j < line.length && /[a-zA-Z0-9_.$?@]/.test(line[j])) {
        j++
      }
      result += replace(line.slice(i, j))
      i = j
      continue
    }
    result += ch
    i++
  }
  return result
}

/**
 * 处理单行：%define 收集定义；其余行做常量替换。
 * 定义行原样返回（注释引擎对 directive 行另行处理）。
 */
export function preprocessLine(line: string, state: PreprocessorState): string {
  const trimmed = line.trim()
  if (trimmed.startsWith('%define')) {
    const body = trimmed.slice('%define'.length).trim()
    const m = /^([a-zA-Z_.$?@][\w.$?@]*)(?:\s+(.*))?$/.exec(body)
    if (m) {
      state.defines.set(m[1], (m[2] ?? '').trim())
    }
    return line
  }
  if (state.defines.size === 0 || trimmed.startsWith('%')) {
    return line
  }
  const defines = state.defines
  return replaceOutsideStrings(line, (word) => {
    const value = defines.get(word)
    return value !== undefined && value.length > 0 ? value : word
  })
}
