/**
 * 简化版预处理器：处理 %define 常量、简单 %macro 宏、%if 条件跟踪与 %include 记录。
 *
 * 设计约束（docs 方案 0.7.0）：
 * - 不完整复刻 NASM 预处理器；只解析**简单非嵌套宏**（体长任意但体内不得再有
 *   %macro/%if 等结构，否则标记 nested 并给出 Hint 诊断）
 * - %if/%elif/%else/%endif 只做配对跟踪（不做条件求值）；块内行记入
 *   conditionalLines（条件汇编不确定提示）；配对不匹配给出 Warning 诊断
 * - %include 记录路径（调用方用 resolveIncludeSymbols 完成符号合并）
 * - %macro / %include 初期返回原始行不展开（多行宏由注释引擎按「调用宏」标注）
 */
import * as fs from 'fs'
import * as path from 'path'

/** 简单宏定义。 */
export interface MacroDef {
  name: string
  /** 参数个数（调用处 %1..%n） */
  argCount: number
  /** 宏体行（原始文本） */
  body: string[]
  /** 体内含嵌套结构（复杂宏，语义解析受限） */
  nested: boolean
}

/** 预处理诊断问题。 */
export interface PreprocessIssue {
  line: number
  message: string
  severity: 2 | 4
}

export interface PreprocessorState {
  defines: Map<string, string>
  macros: Map<string, MacroDef>
  /** 预处理诊断问题（不平衡/复杂宏） */
  issues: PreprocessIssue[]
  /** %if 条件块内的行号（0-based） */
  conditionalLines: Set<number>
  /** %include 引用的文件路径（原文） */
  includes: string[]
  /** 宏调用行：mnemonic 小写 → 展开后的宏体（仅单行体） */
  macroExpansions: Map<number, string[]>
}

export function createPreprocessorState(): PreprocessorState {
  return {
    defines: new Map(),
    macros: new Map(),
    issues: [],
    conditionalLines: new Set(),
    includes: [],
    macroExpansions: new Map()
  }
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

/** 预处理单行解析的内部游标状态。 */
interface ParseCursor {
  macroName?: string
  macroArgCount: number
  macroBody: string[]
  macroStartLine: number
  ifDepth: number
}

/**
 * 预处理单行：更新 defines/macros/条件栈/include 记录与诊断问题。
 * 定义行与宏调用展开在 preprocessLine / expandMacroLine 中处理。
 */
export function parsePreprocessorLine(line: string, lineNumber: number, state: PreprocessorState, cursor: ParseCursor): void {
  const trimmed = line.trim()

  // %macro NAME argc —— 开始收集宏体
  if (cursor.macroName === undefined && /^%macro\b/i.test(trimmed)) {
    const m = /^%macro\s+([a-zA-Z_.$?@][\w.$?@]*)(?:\s+(\d+))?/i.exec(trimmed)
    if (m) {
      cursor.macroName = m[1]
      cursor.macroArgCount = m[2] !== undefined ? parseInt(m[2], 10) : 0
      cursor.macroBody = []
      cursor.macroStartLine = lineNumber
    }
    return
  }

  // 宏体收集
  if (cursor.macroName !== undefined) {
    if (/^%endmacro\b/i.test(trimmed)) {
      const nested = cursor.macroBody.some(
        (b) => /^\s*%(macro|if|elif|else|endif|rep)\b/i.test(b.trim())
      )
      state.macros.set(cursor.macroName.toLowerCase(), {
        name: cursor.macroName,
        argCount: cursor.macroArgCount,
        body: cursor.macroBody,
        nested
      })
      if (nested) {
        state.issues.push({
          line: cursor.macroStartLine,
          message: `复杂宏 "${cursor.macroName}": 含嵌套结构, 语义解析受限, 注释可能不准确`,
          severity: 4
        })
      }
      cursor.macroName = undefined
      return
    }
    if (/^\s*%(macro|if)\b/i.test(trimmed)) {
      cursor.macroBody.push(trimmed)
      return
    }
    cursor.macroBody.push(line)
    return
  }

  // %endmacro 无匹配开宏
  if (/^%endmacro\b/i.test(trimmed)) {
    state.issues.push({ line: lineNumber, message: '%endmacro 缺少匹配的 %macro', severity: 2 })
    return
  }

  // %if 条件汇编：只跟踪深度与块内行号
  if (/^%if\b/i.test(trimmed) || /^%ifdef\b/i.test(trimmed) || /^%ifndef\b/i.test(trimmed)) {
    cursor.ifDepth++
    return
  }
  if (/^%endif\b/i.test(trimmed)) {
    if (cursor.ifDepth === 0) {
      state.issues.push({ line: lineNumber, message: '%endif 缺少匹配的 %if', severity: 2 })
    } else {
      cursor.ifDepth--
    }
    return
  }
  if (/^(%elif|%else)\b/i.test(trimmed)) {
    if (cursor.ifDepth === 0) {
      state.issues.push({ line: lineNumber, message: `${trimmed.split(/\s+/)[0]} 缺少匹配的 %if`, severity: 2 })
    }
    return
  }

  // 条件块内普通行：条件汇编不确定
  if (cursor.ifDepth > 0) {
    state.conditionalLines.add(lineNumber)
    return
  }

  // %include：记录路径（调用方用 resolveIncludeSymbols 完成符号合并）
  if (/^%include\b/i.test(trimmed)) {
    const m = /^%include\s+(.+)$/i.exec(trimmed)
    if (m) {
      state.includes.push(m[1].trim().replace(/^["']|["']$/g, ''))
    }
    return
  }

  // %define 常量
  if (trimmed.startsWith('%define')) {
    const body = trimmed.slice('%define'.length).trim()
    const m = /^([a-zA-Z_.$?@][\w.$?@]*)(?:\s+(.*))?$/.exec(body)
    if (m) {
      state.defines.set(m[1], (m[2] ?? '').trim())
    }
  }
}

/**
 * 宏调用展开（仅单行体宏）：行首标识符为已定义宏时，用参数替换 %1..%n。
 * 多行体宏不展开（由注释引擎按「调用宏」标注）。
 */
export function expandMacroLine(line: string, state: PreprocessorState): string | null {
  const trimmed = line.trim()
  if (trimmed.startsWith('%')) {
    return null
  }
  const m = /^([a-zA-Z_.$?@][\w.$?@]*)(?:\s+(.+))?$/.exec(trimmed)
  if (m === null) {
    return null
  }
  const macro = state.macros.get(m[1].toLowerCase())
  if (macro === undefined || macro.body.length !== 1) {
    return null
  }
  const args = m[2] !== undefined ? m[2].split(/\s*,\s*|\s+/).filter((a) => a.length > 0) : []
  let expanded = macro.body[0]
  for (let n = macro.argCount; n >= 1; n--) {
    expanded = expanded.split(`%${n}`).join(args[n - 1] ?? '')
  }
  // 保留原行缩进
  const indent = /^\s*/.exec(line)?.[0] ?? ''
  return indent + expanded
}

/**
 * 处理单行（%define 替换；定义行原样返回）。
 * 兼容旧接口：仅做常量替换，不涉及宏/条件跟踪。
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

/**
 * 分析整个文档的预处理结构（defines/macros/条件块/不平衡诊断/include）。
 */
export function analyzePreprocessor(text: string): PreprocessorState {
  const state = createPreprocessorState()
  const cursor: ParseCursor = { macroArgCount: 0, macroBody: [], macroStartLine: -1, ifDepth: 0 }
  text.split(/\r?\n/).forEach((line, idx) => {
    parsePreprocessorLine(line, idx, state, cursor)
  })
  // 未闭合
  if (cursor.macroName !== undefined) {
    state.issues.push({ line: cursor.macroStartLine, message: `%macro "${cursor.macroName}" 缺少匹配的 %endmacro`, severity: 2 })
  }
  if (cursor.ifDepth > 0) {
    state.issues.push({ line: text.split(/\r?\n/).length - 1, message: '%if 缺少匹配的 %endif', severity: 2 })
  }
  return state
}

/**
 * 收集整个文档的 %define 常量（Hover 展示用）。
 */
export function collectDefines(text: string): Map<string, string> {
  return analyzePreprocessor(text).defines
}

/**
 * 解析 %include 引用的文件符号（defines/macros 合并；深度限制 3）。
 * 由 server 层调用（需要文档目录做相对路径解析）。
 */
export function resolveIncludeSymbols(
  text: string,
  docDir: string | undefined,
  depth = 0
): { defines: Map<string, string>; macros: Map<string, MacroDef>; issues: PreprocessIssue[] } {
  const state = analyzePreprocessor(text)
  if (depth >= 3 || docDir === undefined) {
    return { defines: state.defines, macros: state.macros, issues: state.issues }
  }
  for (const inc of state.includes) {
    const candidate = path.isAbsolute(inc) ? inc : path.join(docDir, inc)
    try {
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
        continue
      }
      const sub = resolveIncludeSymbols(fs.readFileSync(candidate, 'utf-8'), path.dirname(candidate), depth + 1)
      for (const [k, v] of sub.defines) {
        if (!state.defines.has(k)) {
          state.defines.set(k, v)
        }
      }
      for (const [k, v] of sub.macros) {
        if (!state.macros.has(k)) {
          state.macros.set(k, v)
        }
      }
    } catch {
      // 读取失败静默跳过
    }
  }
  return { defines: state.defines, macros: state.macros, issues: state.issues }
}
