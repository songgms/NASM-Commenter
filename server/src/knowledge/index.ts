/**
 * 知识库模块统一出口。
 */
import type { KnowledgeData, SyscallTable } from '../types'
import { InstructionStore } from './instruction-store'
import { SyscallStore } from './syscall-store'
import { RegisterStore } from './register-store'
import { PatternStore } from './pattern-store'

export { loadKnowledge, findDataDir } from './loader'
export { InstructionStore } from './instruction-store'
export { SyscallStore } from './syscall-store'
export { RegisterStore } from './register-store'
export { PatternStore } from './pattern-store'
export type { MatchedPattern } from './pattern-store'
export {
  validateInstructions,
  validatePatterns,
  validateRegisters,
  validateSyscalls
} from './validate'
export type { ValidationIssue } from './validate'

/** 全部知识库 Store 的集合（引擎依赖注入用）。 */
export interface KnowledgeStores {
  instructions: InstructionStore
  syscalls: SyscallStore
  registers: RegisterStore
  patterns: PatternStore
}

/** 从 KnowledgeData 构建全部 Store。 */
export function buildStores(data: KnowledgeData): KnowledgeStores {
  return {
    instructions: new InstructionStore(data.instructions),
    syscalls: new SyscallStore(data.syscalls as Record<string, SyscallTable>),
    registers: new RegisterStore(data.registers),
    patterns: new PatternStore(data.patterns)
  }
}
