/**
 * 寄存器使用分析：找出函数体中作为源操作数被读取的参数寄存器。
 */
import type { ABI, ParsedLine } from '../types'

const X64_PARAM_REGISTERS = ['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9']
const X64_PARAM_ALIASES: Record<string, string> = {
  edi: 'rdi', esi: 'rsi', edx: 'rdx', ecx: 'rcx',
  r8d: 'r8', r9d: 'r9',
  di: 'rdi', si: 'rsi', dx: 'rdx', cx: 'rcx',
  dil: 'rdi', sil: 'rsi'
}
const X86_PARAM_REGISTERS: string[] = [] // cdecl 参数走栈；寄存器参数约定不适用

/** 函数体中被读取的参数寄存器（按 ABI 参数序）。 */
export function registersReadIn(body: ParsedLine[], abi: ABI): Set<string> {
  if (abi === 'linux-x86') {
    return new Set(X86_PARAM_REGISTERS)
  }
  const canonical: Record<string, string> = { ...X64_PARAM_ALIASES }
  for (const r of X64_PARAM_REGISTERS) {
    canonical[r] = r
  }
  const read = new Set<string>()
  for (const line of body) {
    if (line.kind !== 'instruction') {
      continue
    }
    // 源操作数（跳过第一个操作数：dst 可能是写入）
    const sources = line.operands.slice(1)
    for (const op of sources) {
      if (op.type === 'register') {
        const canon = canonical[op.register ?? op.raw.toLowerCase()]
        if (canon !== undefined) {
          read.add(canon)
        }
      }
    }
    // xor reg,reg 是清零不是读取参数
    if (
      line.mnemonic === 'xor' &&
      line.operands.length === 2 &&
      line.operands[0].raw.toLowerCase() === line.operands[1].raw.toLowerCase()
    ) {
      const canon = canonical[line.operands[0].register ?? '']
      if (canon !== undefined) {
        read.delete(canon)
      }
    }
  }
  return read
}
