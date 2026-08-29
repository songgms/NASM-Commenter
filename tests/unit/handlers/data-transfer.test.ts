/**
 * 数据传送 handler 单元测试（docs/07 §3.8 指定用例）。
 */
import { describe, it, expect } from 'vitest'
import { parseLine } from '../../../server/src/lexer/line-parser'
import { getHandler } from '../../../server/src/handlers'
import { getStores, testConfig } from '../../helpers'

describe('handlers/data-transfer', () => {
  const stores = getStores()
  const config = testConfig()

  it('mov eax, 123 → 将立即数 123 加载到 eax', () => {
    const line = parseLine('mov eax, 123', 0)
    const result = getHandler('mov')!(line, undefined, stores, config)
    expect(result?.comment).toBe('将立即数 123 加载到 eax')
    expect(result?.confidence).toBe(1.0)
    expect(result?.source).toBe('rule')
  })

  it('mov [rbp-8], rax → 将 rax 的值存储到内存 [rbp-8]', () => {
    const line = parseLine('mov [rbp-8], rax', 0)
    const result = getHandler('mov')!(line, undefined, stores, config)
    expect(result?.comment).toBe('将 rax 的值存储到内存 [rbp-8]')
  })

  it('lea rax, [rbx+rcx*4] → 计算地址并加载', () => {
    const line = parseLine('lea rax, [rbx+rcx*4]', 0)
    const result = getHandler('lea')!(line, undefined, stores, config)
    expect(result?.comment).toContain('计算地址 [rbx+rcx*4]')
    expect(result?.comment).toContain('rax')
  })

  it('push rax / pop rax 栈语义', () => {
    const push = getHandler('push')!(parseLine('push rax', 0), undefined, stores, config)
    const pop = getHandler('pop')!(parseLine('pop rax', 0), undefined, stores, config)
    expect(push?.comment).toBe('将 rax 压入栈（rsp 随之减小）')
    expect(pop?.comment).toBe('从栈弹出值到 rax')
  })

  it('mov reg,label → 地址加载', () => {
    const line = parseLine('mov rsi, msg', 0)
    const result = getHandler('mov')!(line, undefined, stores, config)
    expect(result?.comment).toBe('将标签 msg 的地址加载到 rsi')
  })

  it('英文模板', () => {
    const line = parseLine('mov rax, rbx', 0)
    const result = getHandler('mov')!(line, undefined, stores, testConfig({ language: 'en' }))
    expect(result?.comment).toBe('copy rbx to rax')
  })

  it('xchg 交换', () => {
    const line = parseLine('xchg rax, rbx', 0)
    expect(getHandler('xchg')!(line, undefined, stores, config)?.comment).toBe('交换 rax 与 rbx 的值')
  })
})
