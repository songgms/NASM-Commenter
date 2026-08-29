/**
 * 循环追踪器：识别向后跳转构成的循环。
 * - 条件跳转回跳到之前的标签
 * - loop 指令（隐含 rcx/ecx 计数器）
 */
import type { LoopInfo, ParsedLine } from '../types'

/** 输出：回跳指令行号 → 循环信息。 */
export function trackLoops(lines: ParsedLine[]): Map<number, LoopInfo> {
  const labelLines = new Map<string, number>()
  for (const line of lines) {
    if ((line.kind === 'label' || line.kind === 'instruction') && line.label !== undefined) {
      if (!labelLines.has(line.label)) {
        labelLines.set(line.label, line.lineNumber)
      }
    }
  }

  const loops = new Map<number, LoopInfo>()
  for (const line of lines) {
    if (line.kind !== 'instruction' || line.mnemonic === undefined) {
      continue
    }
    const isBackwardJump =
      line.mnemonic === 'loop' ||
      ((line.mnemonic === 'jmp' || line.mnemonic.startsWith('j')) &&
        line.operands[0]?.type === 'label')
    if (!isBackwardJump) {
      continue
    }
    const target = line.operands[0]?.label
    if (target === undefined) {
      continue
    }
    const defLine = labelLines.get(target)
    if (defLine === undefined || defLine >= line.lineNumber) {
      continue
    }
    loops.set(line.lineNumber, {
      startLine: defLine,
      endLine: line.lineNumber,
      label: target,
      counterRegister: line.mnemonic === 'loop' ? 'rcx' : undefined
    })
  }
  return loops
}
