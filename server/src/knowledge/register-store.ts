/**
 * 寄存器约定查询：按 ABI 查参数/返回/系统调用寄存器与调用约定。
 */
import type { ABI, CallingConvention, RegisterConventions } from '../types'

const DEFAULT_CONVENTION: CallingConvention = {
  parameterRegisters: [],
  returnRegister: 'rax',
  syscallNumberRegister: 'rax',
  syscallArgRegisters: ['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9'],
  calleeSaved: ['rbx', 'rbp', 'r12', 'r13', 'r14', 'r15'],
  callerSaved: ['rax', 'rcx', 'rdx', 'rsi', 'rdi', 'r8', 'r9', 'r10', 'r11']
}

export class RegisterStore {
  private readonly data: RegisterConventions

  constructor(data: RegisterConventions) {
    this.data = data
  }

  /** 获取某 ABI 的完整调用约定；未知 ABI 回落 x64 默认。 */
  getCallingConvention(abi: ABI): CallingConvention {
    return this.data[abi]?.callingConvention ?? DEFAULT_CONVENTION
  }

  /** 第 index 个（0-based）函数参数寄存器。 */
  getParameterRegister(abi: ABI, index: number): string | undefined {
    return this.getCallingConvention(abi).parameterRegisters[index]
  }

  /** 返回值寄存器。 */
  getReturnRegister(abi: ABI): string {
    return this.getCallingConvention(abi).returnRegister
  }

  /** 系统调用号寄存器。 */
  getSyscallNumberRegister(abi: ABI): string {
    return this.getCallingConvention(abi).syscallNumberRegister
  }

  /** 系统调用参数寄存器列表。 */
  getSyscallArgRegisters(abi: ABI): string[] {
    return this.getCallingConvention(abi).syscallArgRegisters
  }

  /** 被调用者保存寄存器（call 后不变）。 */
  getCalleeSaved(abi: ABI): string[] {
    return this.getCallingConvention(abi).calleeSaved
  }

  /** 调用者保存寄存器（call 后视为失效）。 */
  getCallerSaved(abi: ABI): string[] {
    return this.getCallingConvention(abi).callerSaved
  }

  /** 寄存器惯例说明（Hover 展示用）。 */
  getRegisterRole(abi: ABI, register: string): string | undefined {
    return this.data[abi]?.registerRoles?.[register.toLowerCase()]
  }
}
