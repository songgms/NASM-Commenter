/**
 * 诊断：未知指令（Hint）、跳转到未定义标签（Warning）、未引用标签（Hint）。
 * 在文档打开与编辑时由 server 推送到 Problems 面板。
 */
import type { ParsedLine } from '../types'
import type { KnowledgeStores } from '../knowledge'
import { parseDocument } from '../lexer/line-parser'
import { tokenizeLine } from '../lexer/tokenizer'
import { INSTRUCTION_PREFIXES, REGISTERS } from '../lexer/token-definitions'
import { detectABI } from '../utils/abi-detector'
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
  const defLineByLabel = new Map<string, number>()
  /** 每个标签的全部定义行（重复定义诊断用） */
  const labelDefs = new Map<string, number[]>()
  for (const line of lines) {
    if (line.label !== undefined) {
      labels.add(line.label)
      if (!defLineByLabel.has(line.label)) {
        defLineByLabel.set(line.label, line.lineNumber)
      }
      const defs = labelDefs.get(line.label) ?? []
      defs.push(line.lineNumber)
      labelDefs.set(line.label, defs)
    }
  }

  const diagnostics: DiagnosticData[] = []
  diagnostics.push(...duplicateLabelDiagnostics(lines, labelDefs))
  diagnostics.push(...stackImbalanceDiagnostics(lines, labelDefs))
  diagnostics.push(...registerOverwriteDiagnostics(lines))
  diagnostics.push(...memToMemDiagnostics(lines))
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
          message: `未知指令 "${line.mnemonic}": 知识库未收录，将生成兜底注释`,
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

  diagnostics.push(...unusedLabelDiagnostics(lines, labels, defLineByLabel))
  diagnostics.push(...duplicateLabelDiagnostics(lines, labelDefs))
  diagnostics.push(...stackImbalanceDiagnostics(lines, labelDefs))
  diagnostics.push(...registerOverwriteDiagnostics(lines))
  diagnostics.push(...memToMemDiagnostics(lines))
  return diagnostics
}

/**
 * 未引用标签 (Hint)：定义了但全文再未出现的标签。
 * 豁免：global 导出、_start 入口。
 * 使用 = 除定义位置（标签冒号对 / 数据定义标签行）外任意标识符出现。
 */
function unusedLabelDiagnostics(
  lines: ParsedLine[],
  labels: Set<string>,
  defLineByLabel: Map<string, number>
): DiagnosticData[] {
  const globals = new Set<string>()
  for (const line of lines) {
    if (line.kind === 'directive' && line.directive === 'global' && line.directiveArgs?.[0]) {
      globals.add(line.directiveArgs[0])
    }
  }

  const used = new Set<string>()
  for (const line of lines) {
    const tokens = tokenizeLine(line.raw)
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      if (tok.type !== 'identifier') {
        continue
      }
      const next = tokens[i + 1]
      const isDefinition = next !== undefined && next.type === 'colon'
      const isDataLabel = line.label === tok.value && (line.kind === 'directive' || line.kind === 'label')
      if (!isDefinition && !isDataLabel) {
        used.add(tok.value)
      }
    }
  }

  const result: DiagnosticData[] = []
  for (const label of labels) {
    if (used.has(label) || globals.has(label) || label === '_start') {
      continue
    }
    const defLine = defLineByLabel.get(label)
    if (defLine === undefined) {
      continue
    }
    const labelTok = tokenizeLine(lines[defLine]?.raw ?? '').find(
      (x) => x.type === 'identifier' && x.value === label
    )
    result.push({
      line: defLine,
      character: labelTok?.start ?? 0,
      length: labelTok !== undefined ? labelTok.end - labelTok.start : label.length,
      message: `标签 "${label}" 未被引用`,
      severity: 4
    })
  }
  return result
}

/** 标签重复定义 (Warning)：同一标签多处定义，第二次起逐一提示。 */
function duplicateLabelDiagnostics(
  lines: ParsedLine[],
  labelDefs: Map<string, number[]>
): DiagnosticData[] {
  const result: DiagnosticData[] = []
  for (const [label, defLines] of labelDefs) {
    if (defLines.length < 2) {
      continue
    }
    for (let i = 1; i < defLines.length; i++) {
      const ln = defLines[i]
      const labelTok = tokenizeLine(lines[ln]?.raw ?? '').find(
        (x) => x.type === 'identifier' && x.value === label
      )
      result.push({
        line: ln,
        character: labelTok?.start ?? 0,
        length: labelTok !== undefined ? labelTok.end - labelTok.start : label.length,
        message: `标签 "${label}" 重复定义 (首次在第 ${defLines[0] + 1} 行)`,
        severity: 2
      })
    }
  }
  return result
}

/** 栈帧失衡 (Hint)：函数使用 rbp 栈帧序言但函数体内无恢复逻辑。 */
function stackImbalanceDiagnostics(
  lines: ParsedLine[],
  labelDefs: Map<string, number[]>
): DiagnosticData[] {
  const result: DiagnosticData[] = []
  const abi = detectABI(lines)
  const isX86 = abi === 'linux-x86' || abi === 'macos-x86'
  const frameReg = isX86 ? 'ebp' : 'rbp'
  const stackReg = isX86 ? 'esp' : 'rsp'
  for (const [label, defLines] of labelDefs) {
    const startLine = defLines[0]
    const isEntry =
      lines.some(
        (l) => l.kind === 'directive' && l.directive === 'global' && l.directiveArgs?.[0] === label
      ) || label === '_start'
    if (!isEntry) {
      continue
    }
    // 序言：入口后第一条 push rbp（跳过入口标签与伪指令行）
    let prologue: number | null = null
    for (let i = startLine; i < lines.length; i++) {
      const l = lines[i]
      if (l.kind === 'instruction' && l.mnemonic === 'push' && l.operands[0]?.raw.toLowerCase() === frameReg) {
        prologue = i
        break
      }
      if (l.kind === 'instruction') {
        break
      }
    }
    if (prologue === null) {
      continue
    }
    let hasRestore = false
    for (let i = prologue; i < lines.length; i++) {
      const l = lines[i]
      if (
        l.kind === 'instruction' &&
        (l.mnemonic === 'leave' ||
          (l.mnemonic === 'mov' &&
            l.operands[0]?.raw.toLowerCase() === stackReg &&
            l.operands[1]?.raw.toLowerCase() === frameReg))
      ) {
        hasRestore = true
        break
      }
      if (i > prologue && l.kind === 'label' && l.label !== undefined && l.label !== label) {
        break
      }
    }
    if (!hasRestore) {
      result.push({
        line: prologue,
        character: 0,
        length: 4,
        message: `函数 "${label}" 使用了 ${frameReg} 栈帧序言但未发现恢复逻辑 (leave 或 mov ${stackReg}, ${frameReg})`,
        severity: 4
      })
    }
  }
  return result
}

/** 寄存器别名归一（沿 parent 链取最高寄存器）。 */
function canonicalRegister(reg: string): string {
  let cur = reg.toLowerCase()
  for (;;) {
    const info = REGISTERS.get(cur)
    if (info?.parent === undefined) {
      return cur
    }
    cur = info.parent
  }
}

/** 收集一行的读取寄存器（源操作数 + 内存基址/变址）。 */
function readRegisters(line: ParsedLine): Set<string> {
  const reads = new Set<string>()
  for (const op of line.operands.slice(1)) {
    if (op.type === 'register' && op.register !== undefined) {
      reads.add(canonicalRegister(op.register))
    }
    if (op.type === 'memory' && op.memory !== undefined) {
      if (op.memory.base !== undefined) {
        reads.add(canonicalRegister(op.memory.base))
      }
      if (op.memory.index !== undefined) {
        reads.add(canonicalRegister(op.memory.index))
      }
    }
  }
  return reads
}

/** 寄存器立即被覆盖 (Hint)：刚写入的寄存器在下一指令被改写且未被读取。 */
function registerOverwriteDiagnostics(lines: ParsedLine[]): DiagnosticData[] {
  const result: DiagnosticData[] = []
  const instructions = lines.filter((l) => l.kind === 'instruction' && l.mnemonic !== undefined)
  for (let i = 0; i + 1 < instructions.length; i++) {
    const a = instructions[i]
    const b = instructions[i + 1]
    if (b.lineNumber !== a.lineNumber + 1) {
      continue
    }
    const dstA = a.operands[0]
    if (dstA?.type !== 'register' || dstA.register === undefined) {
      continue
    }
    if (a.mnemonic === 'mov' && a.operands[1]?.type === 'register') {
      // 寄存器到寄存器传送通常有目的性，跳过
      continue
    }
    const root = canonicalRegister(dstA.register)
    const dstB = b.operands[0]
    if (dstB?.type !== 'register' || dstB.register === undefined) {
      continue
    }
    if (canonicalRegister(dstB.register) !== root) {
      continue
    }
    if (readRegisters(b).has(root)) {
      continue
    }
    const tok = mnemonicToken(a)
    result.push({
      line: a.lineNumber,
      character: tok?.start ?? 0,
      length: tok?.end !== undefined ? tok.end - tok.start : 0,
      message: `对 ${root} 的赋值未使用即被下一指令覆盖`,
      severity: 4
    })
  }
  return result
}

/** 非法内存-内存操作 (Hint)：两个操作数均为内存（串指令无操作数，天然排除）。 */
function memToMemDiagnostics(lines: ParsedLine[]): DiagnosticData[] {
  const result: DiagnosticData[] = []
  for (const line of lines) {
    if (line.kind !== 'instruction' || line.mnemonic === undefined) {
      continue
    }
    if (
      line.operands.length >= 2 &&
      line.operands[0]?.type === 'memory' &&
      line.operands[1]?.type === 'memory'
    ) {
      const tok = mnemonicToken(line)
      result.push({
        line: line.lineNumber,
        character: tok?.start ?? 0,
        length: tok?.end !== undefined ? tok.end - tok.start : line.mnemonic.length,
        message: 'x86 不支持内存到内存操作: 至少一侧需要寄存器中转',
        severity: 4
      })
    }
  }
  return result
}
