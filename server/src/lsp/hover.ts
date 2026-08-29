/**
 * Hover 处理：悬停在指令名 → 指令语义；寄存器 → 寄存器约定；系统调用行 → 调用信息。
 * 输出 Markdown 字符串（由 server 包装为 Hover 对象）。
 */
import type { ABI } from '../types'
import type { KnowledgeStores } from '../knowledge'
import { parseLine, tokenizeLine } from '../lexer'

/** 计算 token 覆盖光标列的 token。 */
function tokenAt(tokens: { start: number; end: number; type: string; value: string }[], character: number): { type: string; value: string } | null {
  for (const tok of tokens) {
    if (character >= tok.start && character < tok.end) {
      return tok
    }
  }
  return null
}

/** 指令 hover 内容。 */
export function instructionHover(mnemonic: string, stores: KnowledgeStores): string | null {
  const entry = stores.instructions.get(mnemonic)
  if (entry === undefined) {
    return null
  }
  const parts: string[] = []
  parts.push(`### \`${mnemonic}\` — ${entry.summary}`)
  parts.push(entry.description)
  parts.push(`**类别**: ${entry.category} · **标志位**: ${entry.flags_affected}`)
  if (entry.operands_note !== undefined) {
    parts.push(`💡 ${entry.operands_note}`)
  }
  const sigs = Object.keys(entry.templates ?? {})
  if (sigs.length > 0) {
    parts.push(`**操作数形式**: ${sigs.map((s) => `\`${s}\``).join(' / ')}`)
  }
  return parts.join('\n\n')
}

/** 寄存器 hover 内容。 */
export function registerHover(register: string, abi: ABI, stores: KnowledgeStores): string | null {
  const role = stores.registers.getRegisterRole(abi, register)
  if (role === undefined) {
    return null
  }
  return `**${register.toLowerCase()}** — ${role}`
}

/** 光标处 hover：返回 Markdown 或 null。 */
export function hoverAt(line: string, character: number, abi: ABI, stores: KnowledgeStores): string | null {
  const parsed = parseLine(line, 0)
  if (parsed.kind !== 'instruction' || parsed.mnemonic === undefined) {
    // 寄存器也可能出现在其他行型，仍然尝试
    const tokens = tokenizeLine(line)
    const tok = tokenAt(tokens, character)
    if (tok !== null && tok.type === 'register') {
      return registerHover(tok.value, abi, stores)
    }
    return null
  }
  const tokens = tokenizeLine(line)
  const tok = tokenAt(tokens, character)
  if (tok === null) {
    return instructionHover(parsed.mnemonic, stores)
  }
  if (tok.type === 'register') {
    return registerHover(tok.value, abi, stores)
  }
  if (tok.type === 'identifier' || tok.type === 'directive') {
    // 命中的是助记符才显示指令 hover
    if (tok.value.toLowerCase() === parsed.mnemonic) {
      return instructionHover(parsed.mnemonic, stores)
    }
    return null
  }
  return instructionHover(parsed.mnemonic, stores)
}
