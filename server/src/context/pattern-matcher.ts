/**
 * 多指令模式匹配器：对解析后的文档行执行滑动窗口扫描。
 */
import type { ParsedLine } from '../types'
import type { KnowledgeStores } from '../knowledge'
import type { MatchedPattern } from '../knowledge/pattern-store'

/**
 * 扫描文档中的指令行，返回互不重叠的模式匹配集合
 * （冲突解决：priority 高者优先，同优先级取更长序列）。
 */
export function matchPatterns(lines: ParsedLine[], stores: KnowledgeStores): MatchedPattern[] {
  const instructionLines = lines.filter((l) => l.kind === 'instruction' && l.mnemonic !== undefined)
  // 复合助记符：rep 前缀行（repne scasb）作为整体参与序列匹配
  const withComposite = instructionLines.map((l) => {
    if (l.prefixes !== undefined && l.prefixes.length > 0 && l.mnemonic !== undefined) {
      const composite: ParsedLine = { ...l, mnemonic: `${l.prefixes.join(' ')} ${l.mnemonic}` }
      return composite
    }
    return l
  })
  return stores.patterns.scanDocument(withComposite)
}
