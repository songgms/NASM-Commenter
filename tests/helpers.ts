/**
 * 测试共享工具：知识库单例、配置、编辑应用模拟。
 */
import { loadKnowledge, buildStores } from '../server/src/knowledge'
import type { KnowledgeStores, CommentConfig, AnnotatedEdit } from '../server/src/types'
import { defaultCommentConfig } from '../server/src/utils/config-defaults'

let cachedStores: KnowledgeStores | null = null

/** 加载一次知识库（真实 data/ 数据）。 */
export function getStores(): KnowledgeStores {
  if (cachedStores === null) {
    cachedStores = buildStores(loadKnowledge())
  }
  return cachedStores
}

/** 默认测试配置（中文 / inline / 保护已有注释）。 */
export function testConfig(overrides?: Partial<CommentConfig>): CommentConfig {
  const base = defaultCommentConfig()
  return { ...base, ...overrides, llm: { ...base.llm, ...(overrides?.llm ?? {}) } }
}

/**
 * 模拟编辑器应用 AnnotatedEdit（插入/替换）到多行文本。
 * 与客户端 WorkspaceEdit.replace 行为一致：按行后序应用避免索引漂移。
 */
export function applyEditsToText(text: string, edits: AnnotatedEdit[]): string {
  const lines = text.split(/\r?\n/)
  const sorted = [...edits].sort(
    (a, b) => b.startLine - a.startLine || b.startCharacter - a.startCharacter
  )
  for (const e of sorted) {
    const line = lines[e.startLine] ?? ''
    if (e.startLine === e.endLine && e.startCharacter === e.endCharacter) {
      lines[e.startLine] = line.slice(0, e.startCharacter) + e.newText + line.slice(e.startCharacter)
    } else {
      lines[e.startLine] = line.slice(0, e.startCharacter) + e.newText + line.slice(e.endCharacter)
    }
  }
  return lines.join('\n')
}
