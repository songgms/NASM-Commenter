/**
 * LLM 适配器接口定义（零实现依赖；具体 Provider 在 factory 中注册）。
 */
import type { ABI, CommentLanguage, LLMConfig } from '../types'

/** 单条指令的 LLM 请求。 */
export interface LLMRequest {
  /** 助记符（小写） */
  instruction: string
  /** 操作数原始文本列表 */
  operands: string[]
  /** 上下文：前后 5 行代码文本 */
  context: string
  abi: ABI
  language: CommentLanguage
}

/** LLM 响应：单条注释。 */
export interface LLMResponse {
  comment: string
  confidence: number
}

/** LLM 适配器接口。实现必须容错：网络/解析失败由引擎静默回退规则结果。 */
export interface LLMAdapter {
  readonly name: string
  generate(request: LLMRequest): Promise<LLMResponse>
  isAvailable(): boolean
}

/** Mock 适配器（测试与离线演示用）：固定响应。 */
export class MockLLMAdapter implements LLMAdapter {
  readonly name = 'mock'

  constructor(private readonly response: Partial<LLMResponse> = {}) {}

  isAvailable(): boolean {
    return true
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    return {
      comment: this.response.comment ?? `[mock] ${request.instruction} ${request.operands.join(', ')}`,
      confidence: this.response.confidence ?? 0.9
    }
  }
}

/** 按配置创建适配器；未启用或 provider 未知返回 undefined。openai/ollama 的具体实现在 factory 注册。 */
export type AdapterFactory = (config: LLMConfig) => LLMAdapter | undefined

const registry = new Map<string, AdapterFactory>()

/** 注册 Provider 工厂（openai-adapter / ollama-adapter 模块加载时调用）。 */
export function registerLLMFactory(provider: string, factory: AdapterFactory): void {
  registry.set(provider, factory)
}

/** 创建适配器：未启用 → undefined；无可用实现 → undefined。 */
export function createLLMAdapter(config: LLMConfig): LLMAdapter | undefined {
  if (!config.enabled) {
    return undefined
  }
  const factory = registry.get(config.provider)
  return factory ? factory(config) : undefined
}
