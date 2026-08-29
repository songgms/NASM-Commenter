/**
 * 行解析器：将 Token 流组装为 ParsedLine。
 *
 * NASM 行结构：[label:] [prefix] [mnemonic] [operands] [; comment]
 * - 标签可单独成行，也可与指令同行
 * - 伪指令（section/db/%define...）与数据定义（msg db ...）单独处理
 * - 指令前缀 rep/repe/repne/lock 前置解析，mnemonic 保留基础指令名
 * - 永不抛异常：整行无法分类时 kind=unknown
 */
import type { ParsedLine, Token } from '../types'
import { findCommentStart } from '../utils/indent'
import { tokenizeLine } from './tokenizer'
import { parseOperandTokens, rawFromTokens, splitOperandTokens } from './operand-parser'
import { DATA_DEFINES, INSTRUCTION_PREFIXES, isPseudoInstruction } from './token-definitions'
import { createPreprocessorState, preprocessLine } from './preprocessor'

/** 提取标签（identifier 后跟 colon），返回标签名与剩余 token 起点。 */
function extractLabel(tokens: Token[]): { label?: string; restFrom: number } {
  let i = 0
  let label: string | undefined
  while (
    i + 1 < tokens.length &&
    tokens[i].type === 'identifier' &&
    tokens[i + 1].type === 'colon'
  ) {
    label = tokens[i].value
    i += 2
  }
  return { label, restFrom: i }
}

/** 按顶层逗号把剩余 token 切成伪指令参数字符串（保留词间空格）。 */
function directiveArgStrings(tokens: Token[]): string[] {
  return splitOperandTokens(tokens).map((group) => rawFromTokens(group).trim()).filter((s) => s.length > 0)
}

/**
 * 解析单行 NASM 源码。
 * @param line 原始行文本（不含换行）
 * @param lineNumber 0-based 行号
 */
export function parseLine(line: string, lineNumber: number): ParsedLine {
  const indentMatch = /^\s*/.exec(line)
  const indent = indentMatch ? indentMatch[0] : ''

  // 字符串感知的注释分离
  const commentIdx = findCommentStart(line)
  const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line
  const commentText = commentIdx >= 0 ? line.slice(commentIdx + 1).trim() : undefined

  const tokens = tokenizeLine(codePart).filter((t) => t.type !== 'whitespace')

  const base: ParsedLine = {
    raw: line,
    lineNumber,
    kind: 'empty',
    operands: [],
    indent
  }
  if (commentText !== undefined && commentText.length > 0) {
    base.comment = commentText
  }

  // 纯注释行
  if (tokens.length === 0) {
    if (commentText !== undefined && commentText.length > 0 && codePart.trim().length === 0) {
      base.kind = 'comment-only'
    }
    return base
  }

  const extracted = extractLabel(tokens)
  let label = extracted.label
  let rest = tokens.slice(extracted.restFrom)

  // 数据定义 / equ：`name db ...` / `name equ value`（首个 identifier 后紧跟伪指令）
  if (
    label === undefined &&
    rest.length >= 2 &&
    rest[0].type === 'identifier' &&
    rest[1].type === 'identifier' &&
    DATA_DEFINES.has(rest[1].value.toLowerCase())
  ) {
    label = rest[0].value
    const directive = rest[1].value.toLowerCase()
    rest = rest.slice(2)
    return {
      ...base,
      kind: 'directive',
      label,
      directive,
      directiveArgs: directiveArgStrings(rest)
    }
  }

  // 标签单独成行
  if (rest.length === 0 && label !== undefined) {
    return { ...base, kind: 'label', label }
  }

  const first = rest[0]
  if (first === undefined) {
    return base
  }

  // 伪指令：%define / section / global / bits / times...
  if (first.type === 'directive' || (first.type === 'identifier' && isPseudoInstruction(first.value))) {
    const directive = first.value.toLowerCase()
    const restTokens = rest.slice(1)
    return {
      ...base,
      kind: 'directive',
      directive,
      directiveArgs: directiveArgStrings(restTokens)
    }
  }

  // 指令（可能带前缀 rep/repe/repne/lock）
  if (first.type === 'identifier' || first.type === 'size-prefix') {
    const prefixes: string[] = []
    let idx = 0
    let mnemonic: string | undefined
    while (idx < rest.length) {
      const tok = rest[idx]
      if (
        tok.type === 'identifier' &&
        prefixes.length < 2 &&
        INSTRUCTION_PREFIXES.has(tok.value.toLowerCase()) &&
        idx + 1 < rest.length &&
        (rest[idx + 1].type === 'identifier' || rest[idx + 1].type === 'size-prefix')
      ) {
        prefixes.push(tok.value.toLowerCase())
        idx++
        continue
      }
      if (tok.type === 'identifier' || tok.type === 'size-prefix') {
        mnemonic = tok.value.toLowerCase()
        idx++
      }
      break
    }
    if (mnemonic === undefined) {
      return { ...base, kind: 'unknown', label }
    }
    const operandTokens = splitOperandTokens(rest.slice(idx))
    const operands = operandTokens
      .filter((g) => g.length > 0)
      .map(parseOperandTokens)
    return {
      ...base,
      kind: 'instruction',
      label,
      mnemonic,
      prefixes: prefixes.length > 0 ? prefixes : undefined,
      operands
    }
  }

  return { ...base, kind: 'unknown', label }
}

/**
 * 解析整个文档（多行文本）。
 * 先做简化预处理（%define 常量替换）用于语义分析，
 * 但 ParsedLine.raw 保留原始行文本，保证编辑位置计算正确。
 */
export function parseDocument(text: string): ParsedLine[] {
  const state = createPreprocessorState()
  return text.split(/\r?\n/).map((line, idx) => {
    const semantic = preprocessLine(line, state)
    const parsed = parseLine(semantic, idx)
    if (semantic !== line) {
      return { ...parsed, raw: line, indent: /^\s*/.exec(line)?.[0] ?? '' }
    }
    return parsed
  })
}
