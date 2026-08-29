/**
 * 逻辑/位运算指令：and / or / xor / not / test / shl / shr / sar / rol / ror。
 * xor reg,reg 由模板条件片段识别为清零；移位说明移位位数。
 */
import { generateFromTemplate } from './shared'
import type { HandlerFunction } from './shared'

export const handleAnd: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('and', line, stores, config)

export const handleOr: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('or', line, stores, config)

export const handleXor: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('xor', line, stores, config)

export const handleNot: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('not', line, stores, config)

export const handleTest: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('test', line, stores, config)

export const handleShl: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('shl', line, stores, config)

export const handleShr: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('shr', line, stores, config)

export const handleSar: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('sar', line, stores, config)

export const handleRol: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('rol', line, stores, config)

export const handleRor: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('ror', line, stores, config)
