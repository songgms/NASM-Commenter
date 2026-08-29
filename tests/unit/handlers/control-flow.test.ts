/**
 * 控制流 handler 单元测试。
 */
import { describe, it, expect } from 'vitest'
import { parseLine } from '../../../server/src/lexer/line-parser'
import { getHandler } from '../../../server/src/handlers'
import { getStores, testConfig } from '../../helpers'
import type { LineContextData } from '../../../server/src/types'

describe('handlers/control-flow', () => {
  const stores = getStores()
  const config = testConfig()

  it('jmp / je / call / ret', () => {
    expect(getHandler('jmp')!(parseLine('jmp .loop', 0), undefined, stores, config)?.comment)
      .toBe('无条件跳转到 .loop')
    expect(getHandler('je')!(parseLine('je .done', 0), undefined, stores, config)?.comment)
      .toBe('相等(ZF=1)时跳转到 .done')
    expect(getHandler('call')!(parseLine('call print_string', 0), undefined, stores, config)?.comment)
      .toBe('调用函数 print_string(返回地址压栈)')
    expect(getHandler('ret')!(parseLine('ret', 0), undefined, stores, config)?.comment)
      .toBe('从函数返回(弹出返回地址)')
  })

  it('loop 指令说明隐含计数器', () => {
    expect(getHandler('loop')!(parseLine('.next', 0) && parseLine('loop .next', 1), undefined, stores, config)?.comment)
      .toContain('ecx/rcx 计数器递减 1')
  })

  it('向后跳转（循环上下文）追加提示', () => {
    const line = parseLine('jnz .loop', 5)
    const ctx: LineContextData = {
      line: 5,
      inFunction: false,
      registers: {},
      loop: { startLine: 1, endLine: 5, label: '.loop' }
    }
    const result = getHandler('jnz')!(line, ctx, stores, config)
    expect(result?.comment).toContain('构成循环')
  })
})
