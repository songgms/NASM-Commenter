/**
 * 标签行处理：函数入口标签 / 普通跳转目标标签。
 */
import { ruleResult } from './shared'
import type { HandlerFunction } from './shared'

export const handleLabel: HandlerFunction = (line, ctx) => {
  if (line.label === undefined) {
    return null
  }
  if (ctx?.inFunction && ctx.functionName === line.label) {
    return ruleResult(`函数入口: ${line.label}`)
  }
  return ruleResult(`标签 ${line.label}(跳转目标)`)
}
