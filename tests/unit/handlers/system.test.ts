/**
 * 系统 handler 单元测试：syscall 结合上下文回溯。
 */
import { describe, it, expect } from 'vitest'
import { parseLine } from '../../../server/src/lexer/line-parser'
import { getHandler } from '../../../server/src/handlers'
import { getStores, testConfig } from '../../helpers'
import type { LineContextData, SyscallContext } from '../../../server/src/types'

function ctxWith(syscall: SyscallContext): LineContextData {
  return { line: syscall.line, inFunction: false, registers: {}, syscall }
}

describe('handlers/system', () => {
  const stores = getStores()
  const config = testConfig()

  it('syscall 无上下文 → 模板兜底', () => {
    const result = getHandler('syscall')!(parseLine('syscall', 0), undefined, stores, config)
    expect(result?.comment).toBe('发起系统调用（调用号在 rax）')
  })

  it('syscall 有回溯 → 调用名(参数值)：说明', () => {
    const syscall: SyscallContext = {
      abi: 'linux-x64',
      number: 1,
      name: 'write',
      args: [
        { register: 'rdi', value: 1, name: 'fd' },
        { register: 'rsi', value: 'msg', name: 'buf' },
        { register: 'rdx', value: 13, name: 'count' }
      ],
      line: 9
    }
    const result = getHandler('syscall')!(parseLine('syscall', 9), ctxWith(syscall), stores, config)
    expect(result?.comment).toBe('调用 write(1, msg, 13)：写文件')
  })

  it('int 0x80 有回溯 → x86 调用名', () => {
    const syscall: SyscallContext = {
      abi: 'linux-x86',
      number: 4,
      name: 'write',
      args: [{ register: 'ebx', value: 1 }],
      line: 3
    }
    const result = getHandler('int')!(parseLine('int 0x80', 3), ctxWith(syscall), stores, config)
    expect(result?.comment).toContain('调用 write(1)')
  })

  it('int 0x80 无上下文 → 模板条件片段', () => {
    const result = getHandler('int')!(parseLine('int 0x80', 0), undefined, stores, config)
    expect(result?.comment).toBe('触发 0x80 软中断（Linux 32 位系统调用入口）')
  })

  it('nop / hlt / cli / sti / cpuid', () => {
    expect(getHandler('nop')!(parseLine('nop', 0), undefined, stores, config)?.comment).toContain('空操作')
    expect(getHandler('hlt')!(parseLine('hlt', 0), undefined, stores, config)?.comment).toContain('停机')
    expect(getHandler('cli')!(parseLine('cli', 0), undefined, stores, config)?.comment).toContain('关中断')
    expect(getHandler('sti')!(parseLine('sti', 0), undefined, stores, config)?.comment).toContain('开中断')
  })
})
