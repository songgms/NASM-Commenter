/**
 * OpenAI 兼容适配器：Chat Completions API（Azure OpenAI / DeepSeek / 通义千问等兼容端点均可）。
 * 使用 Node 18+ 全局 fetch，零额外依赖。
 */
import type { LLMAdapter, LLMRequest, LLMResponse } from './adapter'
import type { LLMConfig } from '../types'
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder'
import { CommentCache } from './cache'
import { logger } from '../utils/logger'

/** 清理 LLM 返回文本：去引号/分号/空白。 */
export function parseCommentText(raw: string): string {
  let text = raw.trim()
  text = text.replace(/^;+\s*/, '')
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      text = text.slice(1, -1).trim()
    }
  }
  return text
}

export class OpenAICompatibleAdapter implements LLMAdapter {
  readonly name = 'openai'
  private readonly cache: CommentCache | null

  constructor(private readonly config: LLMConfig, cache?: CommentCache) {
    this.cache = config.cache ? (cache ?? new CommentCache()) : null
  }

  isAvailable(): boolean {
    return this.config.apiKey.length > 0 || this.config.baseUrl.includes('localhost')
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
      const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: buildSystemPrompt(request.language) },
            { role: 'user', content: buildUserPrompt(request) }
          ],
          temperature: 0.2,
          max_tokens: 100
        }),
        signal: controller.signal
      })
      if (!res.ok) {
        throw new Error(`LLM API ${res.status}: ${await res.text()}`)
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const comment = parseCommentText(data.choices?.[0]?.message?.content ?? '')
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
