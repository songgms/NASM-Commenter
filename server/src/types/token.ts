/**
 * Token 类型定义（零运行时依赖，仅类型）。
 */

/**
 * Token 种类。使用字符串字面量联合类型而非 enum，保证 types/ 目录零运行时输出。
 */
export type TokenType =
  | 'whitespace'
  | 'comment'
  | 'label'
  | 'identifier'
  | 'register'
  | 'integer'
  | 'string'
  | 'character'
  | 'comma'
  | 'colon'
  | 'lbracket'
  | 'rbracket'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'percent'
  | 'dollar'
  | 'directive'
  | 'size-prefix'
  | 'segment'
  | 'unknown'
  | 'eol'

/** 单个 Token：值 + 行内位置（0-based，end 为排他）。 */
export interface Token {
  type: TokenType
  value: string
  start: number
  end: number
}
