/**
 * LLM 模块统一出口（加载本模块即注册全部 Provider 工厂）。
 */
import { registerLLMFactory, createLLMAdapter } from './adapter'
export type { LLMAdapter, LLMRequest, LLMResponse } from './adapter'
export { MockLLMAdapter } from './adapter'
export { buildSystemPrompt, buildUserPrompt } from './prompt-builder'
export { CommentCache } from './cache'
export { OpenAICompatibleAdapter, parseCommentText } from './openai-adapter'
export { OllamaAdapter } from './ollama-adapter'

import { OpenAICompatibleAdapter } from './openai-adapter'
import { OllamaAdapter } from './ollama-adapter'
import type { LLMConfig } from '../types'

// Provider 工厂注册（无需修改引擎代码即可扩展新 Provider）
registerLLMFactory('openai', (config: LLMConfig) => new OpenAICompatibleAdapter(config))
registerLLMFactory('ollama', (config: LLMConfig) => new OllamaAdapter(config))

export { registerLLMFactory, createLLMAdapter }
