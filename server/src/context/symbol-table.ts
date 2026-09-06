/**
 * 符号表：标签、函数、%define 常量、宏、结构体字段的统一索引。
 * 为 definition / references / rename / documentSymbol 提供数据。
 */
import type { ParsedLine, StructDef } from '../types'
import type { MacroDef } from '../lexer/preprocessor'
import { tokenizeLine } from '../lexer/tokenizer'
import { parseStructs } from './struct-table'
import { analyzePreprocessor } from '../lexer/preprocessor'
import { parseDocument } from '../lexer/line-parser'

export type NASMSymbolKind = 'label' | 'function' | 'define' | 'macro' | 'struct-field'

/** 符号条目（位置均为 0-based 行内列）。 */
export interface SymbolEntry {
  name: string
  kind: NASMSymbolKind
  line: number
  character: number
  length: number
  /** 结构体字段的所属结构体名 */
  container?: string
  detail?: string
}

/** 定位某行上指定名称的定义位置 token。 */
function defToken(line: ParsedLine, name: string): { start: number; end: number } | null {
  const tokens = tokenizeLine(line.raw)
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type !== 'identifier') {
      continue
    }
    const next = tokens[i + 1]
    const isLabelDef = tok.value === name && next !== undefined && next.type === 'colon'
    const isBareName = tok.value === name
    if (isLabelDef || isBareName) {
      return { start: tok.start, end: tok.end }
    }
  }
  return null
}

/**
 * 构建文档符号表。
 * 输入 lines 为解析结果；defines/macros 来自预处理分析；structs 来自结构体解析。
 */
export function buildSymbolTable(
  lines: ParsedLine[],
  defines?: Map<string, string>,
  macros?: Map<string, MacroDef>,
  structs?: Map<string, StructDef>
): SymbolEntry[] {
  const symbols: SymbolEntry[] = []

  // 标签 / 函数入口
  const globals = new Set<string>()
  for (const line of lines) {
    if (line.kind === 'directive' && line.directive === 'global' && line.directiveArgs?.[0]) {
      globals.add(line.directiveArgs[0])
    }
  }
  for (const line of lines) {
    if (line.label === undefined) {
      continue
    }
    if (symbols.some((s) => s.name === line.label && s.kind !== 'struct-field')) {
      continue // 重复定义不重复索引（诊断负责提示）
    }
    const tok = defToken(line, line.label)
    if (tok === null) {
      continue
    }
    const isFunction = globals.has(line.label) || line.label === '_start'
    symbols.push({
      name: line.label,
      kind: isFunction ? 'function' : 'label',
      line: line.lineNumber,
      character: tok.start,
      length: tok.end - tok.start
    })
  }

  // %define 常量
  if (defines !== undefined) {
    for (const line of lines) {
      const arg0 = line.directiveArgs?.[0]
      if (line.directive !== '%define' || arg0 === undefined || arg0 === '') {
        continue
      }
      const name = arg0.split(/\s+/)[0]
      if (!defines.has(name)) {
        continue
      }
      const tokens = tokenizeLine(line.raw)
      const tok = tokens.find((t) => t.type === 'identifier' && t.value === name)
      if (tok === undefined) {
        continue
      }
      symbols.push({
        name,
        kind: 'define',
        line: line.lineNumber,
        character: tok.start,
        length: tok.end - tok.start,
        detail: defines.get(name)
      })
    }
  }

  // 宏
  if (macros !== undefined) {
    for (const line of lines) {
      const macroArg = line.directiveArgs?.[0]
      if (line.directive !== '%macro' || macroArg === undefined || macroArg === '') {
        continue
      }
      const name = macroArg.split(/\s+/)[0]
      if (!macros.has(name.toLowerCase())) {
        continue
      }
      const tokens = tokenizeLine(line.raw)
      const tok = tokens.find((t) => t.type === 'identifier' && t.value === name)
      if (tok === undefined) {
        continue
      }
      symbols.push({
        name,
        kind: 'macro',
        line: line.lineNumber,
        character: tok.start,
        length: tok.end - tok.start
      })
    }
  }

  // 结构体与字段
  if (structs !== undefined) {
    for (const line of lines) {
      if (line.directive !== 'struc' || (line.directiveArgs?.[0] ?? '') === '') {
        continue
      }
      const structName = line.directiveArgs?.[0]
      if (line.directive !== 'struc' || structName === undefined || structName === '') {
        continue
      }
      const struct = structs.get(structName.toLowerCase())
      if (struct === undefined) {
        continue
      }
      const tokens = tokenizeLine(line.raw)
      const tok = tokens.find((t) => t.type === 'identifier' && t.value === structName)
      if (tok !== undefined) {
        symbols.push({
          name: structName,
          kind: 'label',
          line: line.lineNumber,
          character: tok.start,
          length: tok.end - tok.start,
          detail: `结构体, 总大小 ${struct.size} 字节`
        })
      }
    }
  }

  return symbols
}

/** 收集整个文档的符号（标签/函数/常量/宏/结构体，一步到位）。 */
export function buildDocumentSymbols(text: string): SymbolEntry[] {
  const lines = parseDocument(text)
  const analysis = analyzePreprocessor(text)
  const structs = parseStructs(lines)
  return buildSymbolTable(lines, analysis.defines, analysis.macros, structs)
}
