/**
 * 自动补全：指令名（命令位置）、寄存器与文档标签（操作数位置）。
 */
import { CompletionItemKind } from 'vscode-languageserver/node'
import type { CompletionItem } from 'vscode-languageserver/node'
import type { KnowledgeStores } from '../knowledge'
import { tokenizeLine } from '../lexer/tokenizer'
import { REGISTERS, INSTRUCTION_PREFIXES } from '../lexer/token-definitions'
import { findCommentStart } from '../utils/indent'

/** 携带跳转目标语义的助记符（操作数位置优先补全标签）。 */
const JUMP_MNEMONICS = new Set([
  'jmp', 'call', 'loop',
  'je', 'jne', 'jz', 'jnz', 'jg', 'jge', 'jl', 'jle', 'ja', 'jae', 'jb', 'jbe',
  'js', 'jns', 'jc', 'jnc', 'jo', 'jno'
])

/** 提供补全时已输入的前缀（命令位置的单词）。 */
function wordPrefixAt(lineText: string, character: number): { prefix: string; tokensBefore: { type: string; value: string }[] } {
  const upToCursor = lineText.slice(0, character)
  const match = /[a-zA-Z0-9_.$?@%]*$/.exec(upToCursor)
  const prefix = match ? match[0] : ''
  const tokens = tokenizeLine(lineText.slice(0, character - prefix.length))
    .filter((t) => t.type !== 'comment')
    .map((t) => ({ type: t.type, value: t.value }))
  return { prefix, tokensBefore: tokens }
}

/** 指令补全项。 */
function mnemonicItems(stores: KnowledgeStores, prefix: string): CompletionItem[] {
  const lower = prefix.toLowerCase()
  return stores.instructions
    .getAllMnemonics()
    .filter((m) => m.startsWith(lower))
    .sort()
    .map((m) => {
      const entry = stores.instructions.get(m)!
      return {
        label: m,
        kind: CompletionItemKind.Function,
        detail: entry.summary,
        documentation: entry.description
      }
    })
}

/** 寄存器补全项（通用 + 段 + SIMD）。 */
function registerItems(prefix: string): CompletionItem[] {
  const lower = prefix.toLowerCase()
  const items: CompletionItem[] = []
  for (const [name, info] of REGISTERS) {
    if (!name.startsWith(lower)) {
      continue
    }
    if (info.category !== 'general' && info.category !== 'segment' && info.category !== 'simd') {
      continue
    }
    items.push({
      label: name,
      kind: CompletionItemKind.Variable,
      detail: `${info.bits} 位${info.category === 'segment' ? '段寄存器' : info.category === 'simd' ? '向量寄存器' : ''}`
    })
  }
  return items.sort((a, b) => a.label.localeCompare(b.label))
}

/** 文档标签补全项（跳转目标，不带冒号）。 */
function labelItems(labelNames: string[], prefix: string): CompletionItem[] {
  return labelNames
    .filter((l) => l.startsWith(prefix))
    .sort()
    .map((l) => ({
      label: l,
      kind: CompletionItemKind.Reference,
      detail: '本文档标签'
    }))
}

/**
 * 生成光标处补全列表：
 * - 注释内 → 无补全
 * - 命令位置（行首/标签后）→ 指令名
 * - 跳转指令操作数位置 → 标签优先，其次寄存器
 * - 其他操作数位置 → 寄存器 + 标签
 */
export function provideCompletions(
  lineText: string,
  character: number,
  stores: KnowledgeStores,
  labelNames: string[]
): CompletionItem[] {
  // 光标处于注释内（或注释之后）不提供补全
  const commentStart = findCommentStart(lineText)
  if (commentStart >= 0 && character > commentStart) {
    return []
  }

  const { prefix, tokensBefore } = wordPrefixAt(lineText, character)

  const meaningful = tokensBefore.filter((t) => t.type !== 'whitespace')
  const last = meaningful[meaningful.length - 1]

  // 命令位置：行首，或刚写完标签冒号
  if (last === undefined || last.type === 'colon') {
    return mnemonicItems(stores, prefix)
  }

  // 跳转指令操作数位置：标签优先（取最后一个标识符作为助记符，兼容标签同行）
  const prevMnemonic = [...meaningful]
    .reverse()
    .find((t) => t.type === 'identifier' && !INSTRUCTION_PREFIXES.has(t.value.toLowerCase()))
    ?.value.toLowerCase()
  if (last.type === 'identifier' && prevMnemonic !== undefined && JUMP_MNEMONICS.has(prevMnemonic)) {
    return [...labelItems(labelNames, prefix), ...registerItems(prefix)]
  }

  // 其他操作数位置：寄存器 + 标签
  return [...registerItems(prefix), ...labelItems(labelNames, prefix)]
}
