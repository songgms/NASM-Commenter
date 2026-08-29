/**
 * Ollama 本地模型适配器（默认 http://localhost:11434）。
 */
import type { LLMAdapter, LLMRequest, LLMResponse } from './adapter'
import type { LLMConfig } from '../types'
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder'
import { CommentCache } from './cache'
import { parseCommentText } from './openai-adapter'
import { logger } from '../utils/logger'

export class OllamaAdapter implements LLMAdapter {
  readonly name = 'ollama'
  private readonly baseUrl: string
  private readonly cache: CommentCache | null

  constructor(private readonly config: LLMConfig, cache?: CommentCache) {
    this.baseUrl = (config.baseUrl.length > 0 && config.baseUrl !== 'https://api.openai.com/v1'
      ? config.baseUrl
      : 'http://localhost:11434').replace(/\/+$/, '')
    this.cache = config.cache ? (cache ?? new CommentCache()) : null
  }

  isAvailable(): boolean {
    return true
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const cache = this.cache
    const key = CommentCache.keyOf(request)
    const cached = cache?.get(key)
    if (cached !== undefined) {
      logger.debug(`LLM 缓存命中 (${this.name}): ${request.instruction}`)
      return { comment: cached, confidence: 0.8 }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeout)
    const startedAt = Date.now()
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: buildUserPrompt(request),
          system: buildSystemPrompt(request.language),
          stream: false,
          options: { temperature: 0.2 }
        }),
        signal: controller.signal
      })
      if (!res.ok) {
        throw new Error(`Ollama API ${res.status}`)
      }
      const data = (await res.json()) as { response?: string }
      const comment = parseCommentText(data.response ?? '')
      if (comment.length === 0) {
        return { comment: '', confidence: 0 }
      }
      cache?.set(key, comment)
      logger.info(`LLM 请求完成 (${this.name}): ${request.instruction}, ${Date.now() - startedAt}ms`)
      return { comment, confidence: 0.8 }
    } catch (e) {
      logger.warn(`LLM 请求失败 (${this.name}, ${request.instruction}): ${String(e)}`)
      throw e
    } finally {
      clearTimeout(timer)
    }
  }
}
