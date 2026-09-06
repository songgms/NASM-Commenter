/**
 * 上下文模块统一出口。
 */
export { DocumentContext } from './document-context'
export { parseStructs, findStructFieldRef } from './struct-table'
export type { StructFieldRef } from './struct-table'
export { trackRegisters, applyLine, isBlockExit, isConditionalExit } from './register-tracker'
export { trackFunctions } from './function-tracker'
export type { FunctionMap } from './function-tracker'
export { registersReadIn } from './register-usage'
export { trackLoops } from './loop-tracker'
export { matchPatterns } from './pattern-matcher'
