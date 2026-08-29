/**
 * 词法分析器统一出口。
 */
export {
  tokenizeLine
} from './tokenizer'

export {
  parseImmediate,
  operandSignature,
  operandsSignature,
  parseOperandTokens,
  rawFromTokens,
  splitOperandTokens
} from './operand-parser'

export { parseLine, parseDocument } from './line-parser'

export {
  createPreprocessorState,
  preprocessLine
} from './preprocessor'

export {
  REGISTERS,
  SEGMENT_REGISTERS,
  SIZE_PREFIXES,
  PSEUDO_INSTRUCTIONS,
  DATA_DEFINES,
  INSTRUCTION_PREFIXES,
  isRegister,
  isSizePrefix,
  isPseudoInstruction
} from './token-definitions'
export type { RegisterInfo } from './token-definitions'
