/**
 * Hover 处理：悬停在指令名 → 指令语义；寄存器 → 寄存器约定；
 * 系统调用号（mov rax/eax, imm 的立即数）→ 系统调用名与参数。
 * 输出 Markdown 字符串（由 server 包装为 Hover 对象）。
 */
import type { ABI, StructDef, SyscallInfo } from '../types'
import type { KnowledgeStores } from '../knowledge'
import { resolveMnemonicKey } from '../knowledge/instruction-store'
import { parseLine, tokenizeLine, parseImmediate } from '../lexer'
import { findStructFieldRef } from '../context/struct-table'
import type { StructFieldRef } from '../context/struct-table'

/** hover 附加数据：%define 宏表 + 结构体表。 */
export interface HoverExtras {
  defines?: Map<string, string>
  structs?: Map<string, StructDef>
}

/** 光标所在 token。 */
function tokenAt(tokens: { start: number; end: number; type: string; value: string }[], character: number): { type: string; value: string; start: number; end: number } | null {
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
  const display = mnemonic.replace(/_fp$/, '')
  const parts: string[] = []
  parts.push(`### \`${display}\` — ${entry.summary}`)
  parts.push(entry.description)
  parts.push(`**类别**: ${entry.category} | **标志位**: ${entry.flags_affected}`)
  if (entry.operands_note !== undefined) {
    parts.push(`${entry.operands_note}`)
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

/** 系统调用 hover 内容。 */
export function syscallHover(number: number, info: SyscallInfo): string {
  const parts: string[] = [`### 系统调用 \`${info.name}\`(${number})`]
  if (info.description !== undefined) {
    parts.push(info.description)
  }
  if (info.args !== undefined && info.args.length > 0) {
    parts.push(`**参数**: ${info.args.join(', ')}`)
  }
  if (info.ret !== undefined) {
    parts.push(`**返回**: ${info.ret}`)
  }
  return parts.join('\n\n')
}

/**
 * 系统调用号识别：`mov rax, imm`（x64）或 `mov eax, imm`（x86）上的立即数 token。
 * 命中系统调用表时返回 Markdown，否则返回 null（回退指令 hover）。
 */
function syscallNumberHover(
  parsed: ReturnType<typeof parseLine>,
  tok: { type: string; value: string } | null,
  abi: ABI,
  stores: KnowledgeStores
): string | null {
  if (tok === null || tok.type !== 'integer' || parsed.kind !== 'instruction' || parsed.mnemonic !== 'mov') {
    return null
  }
  const dst = parsed.operands[0]
  const numberRegister = abi === 'linux-x86' || abi === 'macos-x86' ? 'eax' : 'rax'
  if (dst?.type !== 'register' || dst.register !== numberRegister) {
    return null
  }
  const value = parseImmediate(tok.value)
  if (value === undefined) {
    return null
  }
  const info = stores.syscalls.get(abi, value)
  return info !== undefined ? syscallHover(value, info) : null
}

/** 宏常量 hover 内容。 */
export function defineHover(name: string, value: string): string {
  return `**宏常量 \`${name}\`** = ${value.length > 0 ? value : '(空)'}\n\n来源: %define 定义（使用处已做等值替换）`
}

/** 结构体字段 hover 内容。 */
export function structFieldHover(ref: StructFieldRef): string {
  return [
    `**\`${ref.struct.name}.${ref.field.name}\`** — 结构体字段`,
    `偏移 ${ref.field.offset} 字节 · 大小 ${ref.field.size} 字节`,
    `结构体 \`${ref.struct.name}\` 总大小 ${ref.struct.size} 字节`
  ].join('\n\n')
}

/** 光标处 hover：返回 Markdown 或 null。 */
export function hoverAt(
  line: string,
  character: number,
  abi: ABI,
  stores: KnowledgeStores,
  extras?: HoverExtras
): string | null {
  const parsed = parseLine(line, 0)
  const tokens = tokenizeLine(line)
  const tok = tokenAt(tokens, character)

  // 结构体字段引用（优先，token 形如 Struct.field 或 .field）
  if (tok !== null && tok.type === 'identifier' && extras?.structs !== undefined && tok.value.includes('.')) {
    const ref = findStructFieldRef(extras.structs, tok.value)
    if (ref !== null) {
      return structFieldHover(ref)
    }
  }

  // 宏常量：%define 名称 → 定义值
  if (tok !== null && tok.type === 'identifier' && extras?.defines !== undefined) {
    const value = extras.defines.get(tok.value)
    if (value !== undefined) {
      return defineHover(tok.value, value)
    }
  }

  if (parsed.kind === 'instruction' && parsed.mnemonic !== undefined) {
    const syscallHint = syscallNumberHover(parsed, tok, abi, stores)
    if (syscallHint !== null) {
      return syscallHint
    }
    if (tok !== null && tok.type === 'register') {
      return registerHover(tok.value, abi, stores)
    }
    if (tok !== null && (tok.type === 'identifier' || tok.type === 'directive') && tok.value.toLowerCase() !== parsed.mnemonic) {
      // 命中的不是助记符（如标签引用）→ 无 hover
      return null
    }
    const key = resolveMnemonicKey(parsed.mnemonic, parsed.operands)
    return instructionHover(key, stores)
  }

  // 非指令行：仍尝试寄存器 hover
  if (tok !== null && tok.type === 'register') {
    return registerHover(tok.value, abi, stores)
  }
  return null
}
