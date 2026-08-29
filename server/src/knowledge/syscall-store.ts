/**
 * 系统调用查询：按 ABI + 编号 / 名称查询。
 */
import type { ABI, SyscallTable, SyscallInfo } from '../types'
import { MACOS_SYSCALL_BASE } from '../utils/abi-detector'

export class SyscallStore {
  private readonly tables: Record<string, SyscallTable>
  private readonly nameIndex: Record<string, Record<string, string>> = {}

  constructor(tables: Record<string, SyscallTable>) {
    this.tables = tables
    for (const [abi, table] of Object.entries(tables)) {
      const index: Record<string, string> = {}
      for (const [num, info] of Object.entries(table)) {
        index[info.name] = num
      }
      this.nameIndex[abi] = index
    }
  }

  /**
   * 按编号查询。macOS 的原始编号（0x2000000 + n）自动归一到 macOS BSD 表查询。
   */
  get(abi: ABI, number: number): SyscallInfo | undefined {
    if (abi === 'macos-x64') {
      const n = number >= MACOS_SYSCALL_BASE ? number - MACOS_SYSCALL_BASE : number
      return this.tables['macos-x64']?.[String(n)]
    }
    return this.tables[abi]?.[String(number)]
  }

  /** 按名称查询。 */
  getByName(abi: ABI, name: string): SyscallInfo | undefined {
    const num = this.nameIndex[abi]?.[name]
    if (num === undefined) {
      return undefined
    }
    return this.tables[abi]?.[num]
  }

  /** 是否收录该编号。 */
  has(abi: ABI, number: number): boolean {
    return this.get(abi, number) !== undefined
  }
}
