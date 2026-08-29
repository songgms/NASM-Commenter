/**
 * 逻辑 handler 单元测试。
 */
import { describe, it, expect } from 'vitest'
import { parseLine } from '../../../server/src/lexer/line-parser'
import { getHandler } from '../../../server/src/handlers'
import { getStores, testConfig } from '../../helpers'

describe('handlers/logic', () => {
  const stores = getStores()
  const config = testConfig()

  it('xor reg,reg 识别为清零', () => {
    const result = getHandler('xor')!(parseLine('xor rdi, rdi', 0), undefined, stores, config)
    expect(result?.comment).toBe('rdi 清零(自身异或)')
  })

  it('xor reg,imm 普通异或', () => {
    const result = getHandler('xor')!(parseLine('xor eax, 0xff', 0), undefined, stores, config)
    expect(result?.comment).toBe('对 eax 与 0xff 执行按位异或, 结果存入 eax')
  })

  it('and / or / not / test', () => {
    expect(getHandler('and')!(parseLine('and rax, 0xff', 0), undefined, stores, config)?.comment)
      .toBe('对 rax 与 0xff 执行按位与, 结果存入 rax')
    expect(getHandler('or')!(parseLine('or rax, rbx', 0), undefined, stores, config)?.comment)
      .toBe('对 rax 与 rbx 执行按位或, 结果存入 rax')
    expect(getHandler('not')!(parseLine('not rax', 0), undefined, stores, config)?.comment).toBe('rax 按位取反')
    expect(getHandler('test')!(parseLine('test rax, rax', 0), undefined, stores, config)?.comment)
      .toContain('不保存结果')
  })

  it('移位指令说明移位位数', () => {
    expect(getHandler('shl')!(parseLine('shl rax, 4', 0), undefined, stores, config)?.comment)
      .toBe('将 rax 左移 4 位(低位补 0)')
    expect(getHandler('shr')!(parseLine('shr rax, 2', 0), undefined, stores, config)?.comment)
      .toBe('将 rax 逻辑右移 2 位(高位补 0)')
    expect(getHandler('sar')!(parseLine('sar rax, 1', 0), undefined, stores, config)?.comment)
      .toContain('算术右移')
  })
})
