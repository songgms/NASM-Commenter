/**
 * 算术 handler 单元测试。
 */
import { describe, it, expect } from 'vitest'
import { parseLine } from '../../../server/src/lexer/line-parser'
import { getHandler } from '../../../server/src/handlers'
import { getStores, testConfig } from '../../helpers'

describe('handlers/arithmetic', () => {
  const stores = getStores()
  const config = testConfig()

  it('add reg,reg / reg,imm', () => {
    expect(getHandler('add')!(parseLine('add rax, rbx', 0), undefined, stores, config)?.comment)
      .toBe('将 rbx 加到 rax')
    expect(getHandler('add')!(parseLine('add rax, 8', 0), undefined, stores, config)?.comment)
      .toBe('将立即数 8 加到 rax')
  })

  it('sub / inc / dec / neg', () => {
    expect(getHandler('sub')!(parseLine('sub rsp, 16', 0), undefined, stores, config)?.comment)
      .toBe('从 rsp 减去立即数 16')
    expect(getHandler('inc')!(parseLine('inc rax', 0), undefined, stores, config)?.comment).toBe('rax 加 1')
    expect(getHandler('dec')!(parseLine('dec rcx', 0), undefined, stores, config)?.comment).toBe('rcx 减 1')
    expect(getHandler('neg')!(parseLine('neg rax', 0), undefined, stores, config)?.comment).toContain('取负')
  })

  it('cmp 说明只影响标志位', () => {
    const result = getHandler('cmp')!(parseLine('cmp rax, rbx', 0), undefined, stores, config)
    expect(result?.comment).toContain('比较')
    expect(result?.comment).toContain('不保存结果')
  })

  it('mul / div 隐含寄存器说明', () => {
    expect(getHandler('mul')!(parseLine('mul rbx', 0), undefined, stores, config)?.comment).toContain('rdx')
    expect(getHandler('div')!(parseLine('div rcx', 0), undefined, stores, config)?.comment).toContain('商在 rax')
  })

  it('imul 三操作数形式', () => {
    const result = getHandler('imul')!(parseLine('imul rax, rbx, 4', 0), undefined, stores, config)
    expect(result?.comment).toBe('rax = rbx × 4（有符号）')
  })
})
