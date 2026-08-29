/**
 * 栈操作指令：enter / leave（push/pop 在 data-transfer 中处理）。
 */
import { generateFromTemplate } from './shared'
import type { HandlerFunction } from './shared'

export const handleEnter: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('enter', line, stores, config)

export const handleLeave: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('leave', line, stores, config)
