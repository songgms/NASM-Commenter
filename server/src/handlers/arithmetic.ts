/**
 * 算术类指令：add / sub / inc / dec / neg / cmp / mul / imul / div / idiv。
 * cmp/test 说明仅影响标志位；mul/div 说明隐含寄存器。
 */
import { generateFromTemplate } from './shared'
import type { HandlerFunction } from './shared'

export const handleAdd: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('add', line, stores, config)

export const handleSub: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('sub', line, stores, config)

export const handleInc: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('inc', line, stores, config)

export const handleDec: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('dec', line, stores, config)

export const handleNeg: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('neg', line, stores, config)

export const handleCmp: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('cmp', line, stores, config)

export const handleMul: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('mul', line, stores, config)

export const handleImul: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('imul', line, stores, config)

export const handleDiv: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('div', line, stores, config)

export const handleIdiv: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('idiv', line, stores, config)
