/**
 * LLM 模块单元测试：prompt 构建 / 缓存 / 响应解析 / 工厂 / Mock。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildSystemPrompt, buildUserPrompt } from '../../../server/src/llm/prompt-builder'
import { CommentCache } from '../../../server/src/llm/cache'
import { parseCommentText, OpenAICompatibleAdapter } from '../../../server/src/llm/openai-adapter'
import { MockLLMAdapter, registerLLMFactory, createLLMAdapter } from '../../../server/src/llm/adapter'
import { defaultCommentConfig } from '../../../server/src/utils/config-defaults'
import type { LLMConfig, LLMRequest } from '../../../server/src/types'

function llmConfig(overrides?: Partial<LLMConfig>): LLMConfig {
  return { ...defaultCommentConfig().llm, enabled: true, ...overrides }
}

function request(overrides?: Partial<LLMRequest>): LLMRequest {
  return {
    instruction: 'syscall',
    operands: [],
    context: 'mov rax, 1\nsyscall',
    abi: 'linux-x64',
    language: 'zh',
    ...overrides
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('prompt-builder', () => {
  it('系统提示包含核心规则（中文）', () => {
    const prompt = buildSystemPrompt('zh')
    expect(prompt).toContain('30 个汉字')
    expect(prompt).toContain('空字符串')
  })

  it('英文系统提示', () => {
    expect(buildSystemPrompt('en')).toContain('under 20 words')
  })

  it('用户提示包含 ABI / 指令 / 操作数 / 上下文', () => {
    const prompt = buildUserPrompt(request({ operands: ['rax', '1'], context: 'ctx-line' }))
    expect(prompt).toContain('ABI: linux-x64')
    expect(prompt).toContain('指令: syscall')
    expect(prompt).toContain('rax, 1')
    expect(prompt).toContain('ctx-line')
  })
})

describe('CommentCache', () => {
  it('set/get 与键稳定性', () => {
    expect(CommentCache.keyOf(request())).toBe(CommentCache.keyOf(request()))
    expect(CommentCache.keyOf(request({ instruction: 'read' }))).not.toBe(CommentCache.keyOf(request()))
  })

  it('TTL 过期', () => {
    vi.useFakeTimers()
    const cache = new CommentCache(1000)
    cache.set('k', 'v')
    vi.advanceTimersByTime(1500)
    expect(cache.get('k')).toBeUndefined()
    vi.useRealTimers()
  })

  it('容量上限驱逐最旧条目', () => {
    const cache = new CommentCache(60000, 2)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('c')).toBe('3')
  })
})

describe('parseCommentText', () => {
  it('去引号与分号', () => {
    expect(parseCommentText('  "加载 1" ')).toBe('加载 1')
    expect(parseCommentText("; 注释内容")).toBe('注释内容')
    expect(parseCommentText("'x'")).toBe('x')
    expect(parseCommentText('   ')).toBe('')
  })
})

describe('MockLLMAdapter', () => {
  it('固定响应全流程', async () => {
    const mock = new MockLLMAdapter({ comment: 'mock 注释', confidence: 0.9 })
    expect(mock.isAvailable()).toBe(true)
    const resp = await mock.generate(request())
    expect(resp.comment).toBe('mock 注释')
    expect(resp.confidence).toBe(0.9)
  })
})

describe('LLM factory', () => {
  it('未启用返回 undefined', () => {
    expect(createLLMAdapter({ ...llmConfig(), enabled: false })).toBeUndefined()
  })

  it('注册的 provider 可创建；未注册返回 undefined', () => {
    registerLLMFactory('mock', () => new MockLLMAdapter())
    expect(createLLMAdapter(llmConfig({ provider: 'mock' }))).toBeInstanceOf(MockLLMAdapter)
    expect(createLLMAdapter(llmConfig({ provider: 'nope' }))).toBeUndefined()
  })
})

describe('OpenAICompatibleAdapter', () => {
  it('无 API Key 且非本地端点 → 不可用', () => {
    const adapter = new OpenAICompatibleAdapter(llmConfig({ apiKey: '' }))
    expect(adapter.isAvailable()).toBe(false)
  })

  it('fetch 失败时抛错（引擎静默回退）', async () => {
    const adapter = new OpenAICompatibleAdapter(llmConfig({ apiKey: 'k', baseUrl: 'http://127.0.0.1:9/v1', timeout: 500 }))
    await expect(adapter.generate(request())).rejects.toThrow()
  })

  it('成功响应解析注释文本', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '"发起 write 系统调用"' } }] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new OpenAICompatibleAdapter(llmConfig({ apiKey: 'k' }))
    const resp = await adapter.generate(request())
    expect(resp.comment).toBe('发起 write 系统调用')
    // 第二次命中缓存
    const resp2 = await adapter.generate(request())
    expect(resp2.comment).toBe('发起 write 系统调用')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
