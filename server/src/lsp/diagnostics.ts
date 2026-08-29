/**
 * 诊断：未知指令（Hint）与跳转到未定义标签（Warning）。
 * 在文档打开与编辑时由 server 推送到 Problems 面板。
 */
import type { ParsedLine } from '../types'
import type { KnowledgeStores } from '../knowledge'
import { parseDocument } from '../lexer/line-parser'
import { tokenizeLine } from '../lexer/tokenizer'
import { INSTRUCTION_PREFIXES } from '../lexer/token-definitions'
import { JUMP_MNEMONICS } from './shared'

/** 诊断严重级别（与 LSP DiagnosticSeverity 对齐：2=Warning，4=Hint）。 */
export type DiagnosticSeverityValue = 2 | 4

/** 单条诊断（纯数据，server 层转换为 LSP Diagnostic）。 */
export interface DiagnosticData {
  line: number
  character: number
  length: number
  message: string
  severity: DiagnosticSeverityValue
}

/** 定位指令助记符 token（跳过标签对与指令前缀）。 */
function mnemonicToken(line: ParsedLine): { start: number; end: number; value: string } | null {
  const tokens = tokenizeLine(line.raw)
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type !== 'identifier') {
      continue
    }
    const next = tokens[i + 1]
    if (next !== undefined && next.type === 'colon') {
      i++ // 标签对
      continue
    }
    if (INSTRUCTION_PREFIXES.has(tok.value.toLowerCase())) {
      continue
    }
    return tok
  }
  return null
}

/** 校验整个文档，返回诊断列表。 */
export function validateDocument(text: string, stores: KnowledgeStores): DiagnosticData[] {
  const lines = parseDocument(text)
  const labels = new Set<string>()
  for (const line of lines) {
    if (line.label !== undefined) {
      labels.add(line.label)
    }
  }

  const diagnostics: DiagnosticData[] = []
  for (const line of lines) {
    if (line.kind !== 'instruction' || line.mnemonic === undefined) {
      continue
    }

    // 未知指令（知识库未收录 → 引擎只能生成兜底注释）
    if (!stores.instructions.has(line.mnemonic)) {
      const tok = mnemonicToken(line)
      if (tok !== null) {
        diagnostics.push({
          line: line.lineNumber,
          character: tok.start,
          length: tok.end - tok.start,
          message: `未知指令 "${line.mnemonic}"：知识库未收录，将生成兜底注释`,
          severity: 4
        })
      }
    }

    // 跳转目标未定义
    const target = line.operands[0]
    if (
      JUMP_MNEMONICS.has(line.mnemonic) &&
      target?.type === 'label' &&
      target.label !== undefined &&
      !labels.has(target.label)
    ) {
      const labelTok = tokenizeLine(line.raw).find(
        (t) => t.type === 'identifier' && t.value === target.label
      )
      diagnostics.push({
        line: line.lineNumber,
        character: labelTok?.start ?? 0,
        length: labelTok !== undefined ? labelTok.end - labelTok.start : target.raw.length,
        message: `跳转目标 "${target.label}" 未在本文档中定义`,
        severity: 2
      })
    }
  }
  return diagnostics
}
