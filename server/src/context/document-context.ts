/**
 * 文档级上下文：section、函数、寄存器快照、栈帧、循环、系统调用回溯的统一入口。
 */
import type {
  ABI,
  FunctionInfo,
  LineContextData,
  LoopInfo,
  ParsedLine,
  RegisterStateMap,
  StackFrameInfo,
  SyscallContext
} from '../types'
import type { SyscallStore } from '../knowledge/syscall-store'
import { trackRegisters } from './register-tracker'
import { trackFunctions } from './function-tracker'
import { trackLoops } from './loop-tracker'

/** 栈帧识别：push rbp / mov rbp,rsp / sub rsp,imm 连续序言。 */
function detectStackFrames(lines: ParsedLine[]): Map<number, StackFrameInfo> {
  const frames = new Map<number, StackFrameInfo>()
  const instructions = lines.filter((l) => l.kind === 'instruction')
  for (let i = 0; i + 2 < instructions.length; i++) {
    const a = instructions[i]
    const b = instructions[i + 1]
    const c = instructions[i + 2]
    const isPrologue =
      a.mnemonic === 'push' && a.operands[0]?.raw.toLowerCase() === 'rbp' &&
      b.mnemonic === 'mov' && b.operands[0]?.raw.toLowerCase() === 'rbp' && b.operands[1]?.raw.toLowerCase() === 'rsp' &&
      c.mnemonic === 'sub' && c.operands[0]?.raw.toLowerCase() === 'rsp' && c.operands[1]?.type === 'immediate'
    if (isPrologue) {
      frames.set(a.lineNumber, {
        startLine: a.lineNumber,
        localsSize: typeof c.operands[1].immediate === 'number' ? c.operands[1].immediate : 0,
        baseRegister: 'rbp'
      })
    }
  }
  return frames
}

export class DocumentContext {
  readonly abi: ABI
  readonly lines: ParsedLine[]
  private readonly sections = new Map<number, string>()
  private readonly labelLines = new Map<string, number>()
  private readonly functions: FunctionInfo[]
  private readonly functionByLine: Map<number, FunctionInfo>
  private readonly registerSnapshots: Map<number, RegisterStateMap>
  private readonly loops: Map<number, LoopInfo>
  private readonly stackFrames: Map<number, StackFrameInfo>

  constructor(lines: ParsedLine[], abi: ABI, private readonly syscalls: SyscallStore) {
    this.lines = lines
    this.abi = abi

    let currentSection = '.text'
    for (const line of lines) {
      if (line.kind === 'directive' && line.directive === 'section' && line.directiveArgs?.[0]) {
        currentSection = line.directiveArgs[0]
      }
      this.sections.set(line.lineNumber, currentSection)
      if ((line.kind === 'label' || line.kind === 'instruction') && line.label !== undefined) {
        if (!this.labelLines.has(line.label)) {
          this.labelLines.set(line.label, line.lineNumber)
        }
      }
    }

    const fnMap = trackFunctions(lines, abi)
    this.functions = fnMap.functions
    this.functionByLine = fnMap.byLine
    this.registerSnapshots = trackRegisters(lines)
    this.loops = trackLoops(lines)
    this.stackFrames = detectStackFrames(lines)
  }

  /** 指定行所在函数；不在任何函数内返回 null。 */
  getFunctionAt(lineNumber: number): FunctionInfo | null {
    return this.functionByLine.get(lineNumber) ?? null
  }

  /** 指定行所在 section 名。 */
  getSectionAt(lineNumber: number): string {
    return this.sections.get(lineNumber) ?? '.text'
  }

  /** 指定行或其上方最近的标签名。 */
  getLabelAt(lineNumber: number): string | null {
    let best: string | null = null
    for (const line of this.lines) {
      if (line.lineNumber > lineNumber) {
        break
      }
      if (line.label !== undefined) {
        best = line.label
      }
    }
    return best
  }

  /** 寄存器在指定行之前的最近已知值描述。 */
  getRegisterValue(register: string, beforeLine: number): string | null {
    const state = this.registerSnapshots.get(beforeLine)?.[register.toLowerCase()]
    if (state === undefined || state.value === undefined) {
      return null
    }
    return String(state.value)
  }

  /** 栈帧信息：该行处于某个已识别序言之后、且其 epilogue 之前则返回。 */
  getStackFrameAt(lineNumber: number): StackFrameInfo | undefined {
    // 起始行 <= lineNumber 的最近序言
    let current: { start: number; frame: StackFrameInfo } | undefined
    for (const [start, frame] of this.stackFrames) {
      if (start <= lineNumber) {
        current = { start, frame }
      }
    }
    if (current === undefined) {
      return undefined
    }
    // 该序言与 lineNumber 之间若已出现 epilogue（leave / mov rsp,rbp）则栈帧已释放
    for (let ln = current.start; ln < lineNumber; ln++) {
      const l = this.lines[ln]
      if (
        l?.kind === 'instruction' &&
        (l.mnemonic === 'leave' ||
          (l.mnemonic === 'mov' && l.operands[0]?.raw.toLowerCase() === 'rsp' && l.operands[1]?.raw.toLowerCase() === 'rbp'))
      ) {
        return undefined
      }
    }
    return current.frame
  }

  /** 循环信息（该行为回跳指令时）。 */
  getLoopAt(lineNumber: number): LoopInfo | null {
    return this.loops.get(lineNumber) ?? null
  }

  /** 系统调用回溯：该行为 syscall / int 0x80 时返回解析结果。 */
  getSyscallContext(lineNumber: number): SyscallContext | null {
    const line = this.lines[lineNumber]
    if (line?.kind !== 'instruction' || line.mnemonic === undefined) {
      return null
    }
    const isX86 = this.abi === 'linux-x86'
    const isSyscall = line.mnemonic === 'syscall'
    const isInt80 = line.mnemonic === 'int' && line.operands[0]?.type === 'immediate' && line.operands[0].immediate === 0x80
    if (!isSyscall && !isInt80) {
      return null
    }
    const numberReg = isX86 || isInt80 ? 'eax' : 'rax'
    const state = this.registerSnapshots.get(lineNumber)?.[numberReg]
    const rawNumber = typeof state?.value === 'number' ? state.value : undefined
    const info = rawNumber !== undefined ? this.syscalls.get(this.abi, rawNumber) : undefined

    const argRegisters = isX86 || isInt80
      ? ['ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp']
      : ['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9']
    const snapshot = this.registerSnapshots.get(lineNumber) ?? {}
    const args = argRegisters.map((reg, i) => ({
      register: reg,
      value: snapshot[reg]?.value,
      name: info?.args?.[i]
    }))

    return {
      abi: this.abi,
      number: rawNumber,
      name: info?.name,
      args,
      line: lineNumber
    }
  }

  /** 全部函数。 */
  getFunctions(): FunctionInfo[] {
    return [...this.functions]
  }

  /**
   * 构建每行的上下文快照（引擎输入）。
   */
  buildLineContexts(): Map<number, LineContextData> {
    const result = new Map<number, LineContextData>()
    let activeFrame: StackFrameInfo | undefined
    for (const line of this.lines) {
      const fn = this.functionByLine.get(line.lineNumber)
      const frameAtStart = this.stackFrames.get(line.lineNumber)
      if (frameAtStart !== undefined) {
        activeFrame = frameAtStart
      }
      if (line.kind === 'instruction' && (line.mnemonic === 'leave' || (line.mnemonic === 'mov' && line.operands[0]?.raw.toLowerCase() === 'rsp' && line.operands[1]?.raw.toLowerCase() === 'rbp'))) {
        activeFrame = undefined
      }
      result.set(line.lineNumber, {
        line: line.lineNumber,
        section: this.getSectionAt(line.lineNumber),
        inFunction: fn !== undefined,
        functionName: fn?.name,
        registers: this.registerSnapshots.get(line.lineNumber) ?? {},
        stackFrame: activeFrame,
        syscall: this.getSyscallContext(line.lineNumber) ?? undefined,
        loop: this.loops.get(line.lineNumber)
      })
    }
    return result
  }
}
