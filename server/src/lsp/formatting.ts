/**
 * 基础格式化：标签顶格、助记符/操作数分列对齐、注释跟随。
 * 只调整空白，不改动注释文本内容（幂等与移除逻辑不受影响）。
 */
import type { AnnotatedEdit, ParsedLine } from '../types'
import { parseDocument } from '../lexer/line-parser'

const MNEMONIC_COLUMN = 4
const MIN_OPERAND_COLUMN = 20
const MIN_COMMENT_COLUMN = 28

/** 单行结构化片段。 */
interface LineParts {
  kind: 'empty' | 'comment-only' | 'label-only' | 'code'
  label?: string
  mnemonic?: string
  operands?: string
  /** 注释原文（含 ;） */
  comment?: string
  mnemonicLength?: number
  operandsLength?: number
}

function splitLine(line: ParsedLine): LineParts {
  if (line.kind === 'empty') {
    return { kind: 'empty' }
  }
  if (line.kind === 'comment-only') {
    return { kind: 'comment-only', comment: `; ${line.comment ?? ''}` }
  }
  const label = line.label !== undefined ? `${line.label}:` : undefined
  const comment = line.comment !== undefined ? `; ${line.comment}` : undefined

  if (line.kind === 'label' || (line.mnemonic === undefined && line.directive === undefined)) {
    return { kind: 'label-only', label, comment }
  }

  if (line.kind === 'directive') {
    const mnemonic = line.directive !== undefined ? [line.directive, ...(line.directiveArgs ?? [])].join(' ') : undefined
    return {
      kind: 'code',
      label,
      mnemonic,
      comment,
      mnemonicLength: mnemonic?.length ?? 0,
      operandsLength: 0
    }
  }

  const mnemonic = line.mnemonic !== undefined ? [...(line.prefixes ?? []), line.mnemonic].join(' ') : undefined
  const operands = line.operands.length > 0 ? line.operands.map((o) => o.raw).join(', ') : undefined
  return {
    kind: 'code',
    label,
    mnemonic,
    operands,
    comment,
    mnemonicLength: mnemonic?.length ?? 0,
    operandsLength: operands?.length ?? 0
  }
}

/** 渲染一行：label 后 1 空格，mnemonic/operands/comment 各自对齐到列。 */
function renderLine(
  p: LineParts,
  mnemonicColumn: number,
  operandColumn: number,
  commentColumn: number
): string {
  let out = ''
  let cursor = 0

  if (p.label !== undefined) {
    out += p.label
    cursor = p.label.length
    out += ' '
    cursor += 1
  }

  if (p.mnemonic !== undefined) {
    if (cursor < mnemonicColumn) {
      out += ' '.repeat(mnemonicColumn - cursor)
      cursor = mnemonicColumn
    }
    out += p.mnemonic
    cursor += p.mnemonic.length

    if (p.operands !== undefined) {
      if (cursor < operandColumn) {
        out += ' '.repeat(operandColumn - cursor)
        cursor = operandColumn
      } else {
        out += ' '
        cursor += 1
      }
      out += p.operands
      cursor += p.operands.length
    }
  }

  if (p.comment !== undefined) {
    if (out.length === 0) {
      return p.comment.trimEnd()
    }
    if (cursor < commentColumn) {
      out += ' '.repeat(commentColumn - cursor)
    } else {
      out += '  '
    }
    out += p.comment
  }

  return out.trimEnd()
}

/**
 * 格式化整个文档，返回覆盖全文的单个编辑（无变化返回空数组）。
 * 规则：标签顶格；助记符列 ≥4；操作数列按块内最宽助记符对齐（≥20）；
 * 注释列按块内最宽操作数 +2（≥28）。空行/纯注释行保持原样。
 */
export function formatDocumentEdits(text: string): AnnotatedEdit[] {
  const lines = text.split(/\r?\n/)
  const parsed = parseDocument(text)
  const parts = parsed.map(splitLine)

  const output: string[] = []
  let i = 0
  while (i < parts.length) {
    if (parts[i].kind === 'empty' || parts[i].kind === 'comment-only') {
      output.push(parts[i].comment !== undefined ? parts[i].comment!.trimEnd() : '')
      i++
      continue
    }
    // 连续 code/label-only 行为一个对齐块
    let j = i
    let mnemonicColumn = MNEMONIC_COLUMN
    let maxMnemonic = 0
    let maxOperands = 0
    while (j < parts.length && (parts[j].kind === 'code' || parts[j].kind === 'label-only')) {
      if (parts[j].label !== undefined) {
        mnemonicColumn = Math.max(mnemonicColumn, parts[j].label!.length + 2)
      }
      maxMnemonic = Math.max(maxMnemonic, parts[j].mnemonicLength ?? 0)
      maxOperands = Math.max(maxOperands, parts[j].operandsLength ?? 0)
      j++
    }
    const operandColumn = Math.max(MIN_OPERAND_COLUMN, mnemonicColumn + maxMnemonic + 1)
    const commentColumn = Math.max(MIN_COMMENT_COLUMN, operandColumn + maxOperands + 2)
    for (let k = i; k < j; k++) {
      output.push(renderLine(parts[k], mnemonicColumn, operandColumn, commentColumn))
    }
    i = j
  }

  const formatted = output.join('\n')
  if (formatted === text) {
    return []
  }
  const lastLine = lines[lines.length - 1] ?? ''
  return [{
    startLine: 0,
    startCharacter: 0,
    endLine: lines.length - 1,
    endCharacter: lastLine.length,
    newText: formatted
  }]
}
