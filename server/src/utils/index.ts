/**
 * 工具函数统一出口。
 */
export { createLogger, logger } from './logger'
export type { LogLevel, Logger } from './logger'

export {
  calculateCommentColumn,
  findCommentStart,
  hasExistingComment,
  stripExistingComment
} from './indent'

export { hashString } from './hash'

export { detectABI, MACOS_SYSCALL_BASE } from './abi-detector'

export { defaultCommentConfig, resolveConfig } from './config-defaults'
