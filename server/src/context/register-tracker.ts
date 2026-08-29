/**
 * 寄存器追踪器：基本块内线性常量传播。
 *
 * 传播规则（docs/03 §11）：
 * - mov reg, imm → 常量；mov reg, label/mem → memory-ref；mov reg, reg → 复制来源
 * - xor reg,reg → 0；lea reg,[mem] → 地址；add/sub reg,imm → 常量可更新
 * - 别名：写入 eax 同步更新 rax（低 32 位），沿 parent 链向上传播
 * - call 后所有 caller-saved 置 unknown；跳转目标（块入口）处重置为 unknown
 */
import type { ParsedLine, RegisterState, RegisterStateMap } from '../types'
import { REGISTERS } from '../lexer/token-definitions'

/** 跳转/返回/系统调用类助记符（块出口）。 */
const BLOCK_EXIT_MNEMONICS = new Set(['jmp', 'ret', 'syscall'])

const JCC_MNEMONICS = new Set([
  'je', 'jne', 'jz', 'jnz', 'jg', 'jge', 'jl', 'jle', 'ja', 'jae', 'jb', 'jbe',
  'js', 'jns', 'jc', 'jnc', 'jo', 'jno'
])

/** 该行是否为无条件块出口。 */
export function isBlockExit(line: ParsedLine): boolean {
  if (line.kind !== 'instruction' || line.mnemonic === undefined) {
    return false
  }
  return BLOCK_EXIT_MNEMONICS.has(line.mnemonic)
}

/** 该行是否为条件出口（jcc / loop / call 不打断 fall-through 但影响分析保守性）。 */
export function isConditionalExit(line: ParsedLine): boolean {
  if (line.kind !== 'instruction' || line.mnemonic === undefined) {
    return false
  }
  return JCC_MNEMONICS.has(line.mnemonic) || line.mnemonic === 'loop'
}

function unknownState(line: number): RegisterState {
  return { kind: 'unknown', sourceLine: line, isConstant: false }
}

function constState(value: number | string, line: number, kind: RegisterState['kind'] = 'constant'): RegisterState {
  return { value, kind, sourceLine: line, isConstant: kind === 'constant' }
}

/** 沿 parent 链收集别名（eax → rax）。 */
function aliasChain(register: string): string[] {
  const chain: string[] = []
  let cur: string | undefined = register
  while (cur !== undefined) {
    chain.push(cur)
    cur = REGISTERS.get(cur)?.parent
  }
  return chain
}

/** 应用单行对寄存器状态的影响；返回更新后的新状态（不修改入参）。 */
export function applyLine(line: ParsedLine, state: RegisterStateMap): RegisterStateMap {
  const next: RegisterStateMap = { ...state }
  if (line.kind !== 'instruction' || line.mnemonic === undefined) {
    return next
  }
  const ops = line.operands
  const dst = ops[0]
  const src = ops[1]
  const ln = line.lineNumber
  const m = line.mnemonic

  const writeReg = (reg: string, st: RegisterState): void => {
    for (const alias of aliasChain(reg)) {
      next[alias] = st
    }
  }

  if (m === 'mov' && dst?.type === 'register') {
    if (src?.type === 'immediate' && src.immediate !== undefined) {
      writeReg(dst.register!, constState(src.immediate, ln))
      return next
    }
    if (src?.type === 'label') {
      writeReg(dst.register!, constState(src.label ?? src.raw, ln, 'memory-ref'))
      return next
    }
    if (src?.type === 'memory') {
      writeReg(dst.register!, constState(src.raw, ln, 'memory-ref'))
      return next
    }
    if (src?.type === 'register') {
      const srcState = next[src.register!] ?? unknownState(ln)
      writeReg(dst.register!, { ...srcState, sourceLine: ln })
      return next
    }
    writeReg(dst.register!, unknownState(ln))
    return next
  }

  if (m === 'lea' && dst?.type === 'register' && src?.type === 'memory') {
    writeReg(dst.register!, constState(src.raw, ln, 'memory-ref'))
    return next
  }

  if (m === 'xor' && dst?.type === 'register' && src?.type === 'register' && dst.register === src.register) {
    writeReg(dst.register!, constState(0, ln))
    return next
  }

  if ((m === 'add' || m === 'sub') && dst?.type === 'register' && src?.type === 'immediate' && src.immediate !== undefined) {
    const cur = next[dst.register!]
    if (cur?.isConstant === true && typeof cur.value === 'number') {
      const delta = m === 'add' ? src.immediate : -src.immediate
      writeReg(dst.register!, constState(cur.value + delta, ln))
      return next
    }
  }

  if (m === 'pop' && dst?.type === 'register') {
    writeReg(dst.register!, { kind: 'stack-ref', sourceLine: ln, isConstant: false })
    return next
  }

  if (m === 'call') {
    // caller-saved 失效（rax 之外的全部 caller-saved + rax 保持 unknown）
    for (const reg of ['rax', 'rcx', 'rdx', 'rsi', 'rdi', 'r8', 'r9', 'r10', 'r11', 'eax', 'ecx', 'edx', 'esi', 'edi']) {
      next[reg] = unknownState(ln)
    }
    return next
  }

  if (m === 'syscall' || m === 'div' || m === 'idiv' || m === 'mul' || m === 'imul') {
    for (const reg of ['rax', 'rdx', 'eax', 'edx']) {
      next[reg] = unknownState(ln)
    }
    return next
  }

  if (dst?.type === 'register') {
    // 其余写入寄存器的指令（not/neg/inc/dec/movzx/...）→ 保守 unknown
    writeReg(dst.register!, unknownState(ln))
  }
  return next
}

/**
 * 全文线性扫描，输出每行执行前的寄存器状态快照。
 * 块入口（标签行或被跳转目标）处状态重置为 unknown。
 */
export function trackRegisters(lines: ParsedLine[]): Map<number, RegisterStateMap> {
  // 先收集全部跳转目标行号
  const targets = new Set<number>()
  const labelLines = new Map<string, number>()
  for (const line of lines) {
    if (line.kind === 'label' && line.label !== undefined) {
      labelLines.set(line.label, line.lineNumber)
    }
    if (
      (line.kind === 'instruction' || line.kind === 'label') &&
      line.label !== undefined
    ) {
      targets.add(line.lineNumber)
    }
  }
  for (const line of lines) {
    if (line.kind !== 'instruction' || line.mnemonic === undefined) {
      continue
    }
    const isJump = BLOCK_EXIT_MNEMONICS.has(line.mnemonic) || isConditionalExit(line) || line.mnemonic === 'call'
    if (!isJump) {
      continue
    }
    const target = line.operands.find((o) => o.type === 'label')?.label
    if (target !== undefined) {
      const defLine = labelLines.get(target)
      if (defLine !== undefined) {
        targets.add(defLine)
      }
    }
  }

  let state: RegisterStateMap = {}
  const snapshots = new Map<number, RegisterStateMap>()
  for (const line of lines) {
    if (targets.has(line.lineNumber)) {
      state = {}
    }
    if (line.kind === 'instruction') {
      snapshots.set(line.lineNumber, state)
      state = applyLine(line, state)
    }
  }
  return snapshots
}
