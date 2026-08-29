/**
 * 数据传送类指令：mov / xchg / push / pop / lea / movzx / movsx。
 * 全部由知识库模板驱动；lea 描述有效地址计算，push/pop 说明栈变化。
 */
import { generateFromTemplate } from './shared'
import type { HandlerFunction } from './shared'

export const handleMov: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('mov', line, stores, config)

export const handleXchg: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('xchg', line, stores, config)

export const handlePush: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('push', line, stores, config)

export const handlePop: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('pop', line, stores, config)

export const handleLea: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('lea', line, stores, config)

export const handleMovzx: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('movzx', line, stores, config)

export const handleMovsx: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('movsx', line, stores, config)
