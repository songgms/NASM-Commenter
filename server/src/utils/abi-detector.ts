/**
 * ABI 自动检测器。
 *
 * 检测优先级（见 docs/07 §3.4.1 与 docs/02 §14）：
 * 1. `bits 32` 指令 → linux-x86
 * 2. `int 0x80` → linux-x86
 * 3. `syscall` + `mov rax, imm >= 0x2000000` → macos-x64
 * 4. `syscall` 或 `bits 64` → linux-x64（默认）
 */
import type { ABI } from '../types'
import type { ParsedLine } from '../types'

/** macOS 系统调用号基址（0x2000000 + 调用号）。 */
export const MACOS_SYSCALL_BASE = 0x2000000

/**
 * 从解析后的文档行推断目标 ABI。无法确定时返回 linux-x64（最常见）。
 */
export function detectABI(lines: ParsedLine[]): ABI {
  let hasSyscall = false
  let macosHint = false
  let hasBits64 = false

  for (const line of lines) {
    if (line.kind === 'directive' && line.directive === 'bits') {
      const arg = (line.directiveArgs?.[0] ?? '').toLowerCase()
      if (arg === '32') {
        return 'linux-x86'
      }
      if (arg === '64') {
        hasBits64 = true
      }
      continue
    }

    if (line.kind !== 'instruction') {
      continue
    }

    if (line.mnemonic === 'int') {
      const imm = line.operands[0]
      if (imm && imm.type === 'immediate' && imm.immediate === 0x80) {
        return 'linux-x86'
      }
      continue
    }

    if (line.mnemonic === 'syscall') {
      hasSyscall = true
      continue
    }

    if (line.mnemonic === 'mov' && line.operands.length >= 2) {
      const dst = line.operands[0]
      const src = line.operands[1]
      if (
        dst.type === 'register' &&
        dst.register === 'rax' &&
        src.type === 'immediate' &&
        typeof src.immediate === 'number' &&
        src.immediate >= MACOS_SYSCALL_BASE
      ) {
        macosHint = true
      }
    }
  }

  if (hasSyscall && macosHint) {
    return 'macos-x64'
  }
  if (hasBits64 || hasSyscall) {
    return 'linux-x64'
  }
  return 'linux-x64'
}
