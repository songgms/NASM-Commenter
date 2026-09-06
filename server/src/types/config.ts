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
  /** LLM 参与方式：supplement=仅虚拟预览 (默认), fallback=写入文件 */
  augmentMode: 'supplement' | 'fallback'
  /** 低于该置信度的 LLM 输出被丢弃 */
  confidenceThreshold: number
  /** 自定义 system prompt 模板 (空 = 内置) */
  promptTemplate: string
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
  /** 基础格式化（标签/助记符/操作数对齐，默认关闭） */
  format: { enable: boolean }
  /** 虚拟注释预览（Inlay Hint 幽灵文字，不修改文档；默认 true） */
  virtual: boolean
  /** 虚拟注释作用范围：all=全部段，textOnly=仅 .text 代码段 */
  virtualScope: 'all' | 'textOnly'
  /** 注释分号风格：';' 或 ';;'（块注释风格） */
  semicolonStyle: ';' | ';;'
  /** 函数块注释模板，占位符 {name} {purpose} {args} {return} {clobbered}，多行用 \n */
  functionTemplate: string
  /**
   * 自动注释标记前缀（默认空 = 不带标记）。
   * 设置如 `[nasm-commenter] ` 可恢复精确的标记式移除。
   */
  marker: string
  /** ABI：auto 为自动检测 */
  abi: ABI | 'auto'
  llm: LLMConfig
}
