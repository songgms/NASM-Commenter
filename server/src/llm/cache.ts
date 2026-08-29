/**
 * LLM 注释缓存：按请求哈希缓存结果（Map 插入序近似 LRU），TTL 可配置。
 */
import type { LLMRequest } from './adapter'
import { hashString } from '../utils/hash'

export class CommentCache {
  private readonly entries = new Map<string, { value: string; at: number }>()

  constructor(
    private readonly ttlMs: number = 10 * 60 * 1000,
    private readonly maxSize: number = 1000
  ) {}

  /** 缓存键：指令 + 操作数 + 上下文 + ABI + 语言。 */
  static keyOf(request: LLMRequest): string {
    return hashString(
      `${request.instruction}|${request.operands.join(',')}|${request.context}|${request.abi}|${request.language}`
    )
  }

  get(key: string): string | undefined {
    const hit = this.entries.get(key)
    if (hit === undefined) {
      return undefined
    }
    if (Date.now() - hit.at > this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    // 刷新插入序（近似 LRU）
    this.entries.delete(key)
    this.entries.set(key, hit)
    return hit.value
  }

  set(key: string, value: string): void {
    if (this.maxSize <= 0 || value.length === 0) {
      return
    }
    if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) {
        this.entries.delete(oldest)
      }
    }
    this.entries.set(key, { value, at: Date.now() })
  }

  clear(): void {
    this.entries.clear()
  }
}
