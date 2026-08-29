/**
 * 测试共享工具：知识库单例、配置、编辑应用模拟。
 */
import { loadKnowledge, buildStores } from '../server/src/knowledge'
import type { KnowledgeStores, CommentConfig } from '../server/src/types'
import { defaultCommentConfig } from '../server/src/utils/config-defaults'
import { applyEditsToText } from '../server/src/engine/deduplicator'

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

/** 模拟编辑器应用 AnnotatedEdit（与客户端行为一致；实现见 server/src/engine/deduplicator）。 */
export { applyEditsToText }
