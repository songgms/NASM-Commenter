/**
 * 配置类型定义（零运行时依赖，仅类型）。
 */
import type { ABI } from './knowledge'
import type { CommentLanguage, CommentStyle } from './comment'

/** LLM 提供方。 */
export type LLMProvider = 'openai' | 'ollama' | 'mock'

/** LLM 增强配置。 */
export interface LLMConfig {
  /** 默认关闭：规则引擎永远可用 */
  enabled: boolean
  provider: LLMProvider
  apiKey: string
  model: string
  /** OpenAI 兼容端点（provider=openai 时生效） */
  baseUrl: string
  /** 请求超时毫秒 */
  timeout: number
  /** 结果缓存 */
  cache: boolean
}

/** 注释生成配置（客户端读取并同步到 server）。 */
export interface CommentConfig {
  /** 总开关 */
  enable: boolean
  language: CommentLanguage
  style: CommentStyle
  /** 行内注释最小对齐列 */
  minColumn: number
  /** 详细模式 */
  verbose: boolean
  /** 保存时自动注释 */
  autoAnnotate: boolean
  /** 保护用户已有注释（默认 true） */
  protectExistingComments: boolean
  /**
   * 自动注释标记前缀（默认空 = 不带标记）。
   * 设置如 `[nasm-commenter] ` 可恢复精确的标记式移除。
   */
  marker: string
  /** ABI：auto 为自动检测 */
  abi: ABI | 'auto'
  llm: LLMConfig
}
