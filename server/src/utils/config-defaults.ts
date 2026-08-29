/**
 * 配置默认值与合并（server 端兜底，client 端另有读取逻辑）。
 */
import type { CommentConfig } from '../types'

/** 默认配置（与 package.json contributes.configuration 保持一致）。 */
export function defaultCommentConfig(): CommentConfig {
  return {
    enable: true,
    language: 'zh',
    style: 'inline',
    minColumn: 32,
    verbose: false,
    autoAnnotate: false,
    protectExistingComments: true,
    virtual: true,
    marker: '',
    abi: 'auto',
    llm: {
      enabled: false,
      provider: 'openai',
      apiKey: '',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      timeout: 30000,
      cache: true
    }
  }
}

/**
 * 合并部分配置与默认值；未提供的字段回落默认值。
 */
export function resolveConfig(partial?: Partial<CommentConfig>): CommentConfig {
  const base = defaultCommentConfig()
  if (!partial) {
    return base
  }
  const merged: CommentConfig = {
    ...base,
    ...partial,
    llm: {
      ...base.llm,
      ...(partial.llm ?? {})
    }
  }
  return merged
}
