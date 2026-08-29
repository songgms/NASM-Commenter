/**
 * 自动补全单元测试。
 */
import { describe, it, expect } from 'vitest'
import { provideCompletions } from '../../../server/src/lsp/completion'
import { getStores } from '../../helpers'

const stores = getStores()
const LABELS = ['_start', 'count_loop', '.done', 'print_string']

describe('provideCompletions', () => {
  it('命令位置 → 指令名补全', () => {
    const items = provideCompletions('mo', 2, stores, LABELS)
    const labels = items.map((i) => i.label)
    expect(labels).toContain('mov')
    expect(labels).not.toContain('add')
    const mov = items.find((i) => i.label === 'mov')!
    expect(mov.detail).toBe('数据传送')
  })

  it('命令位置空前缀 → 全部指令', () => {
    const items = provideCompletions('', 0, stores, LABELS)
    expect(items.length).toBeGreaterThanOrEqual(80)
  })

  it('标签冒号后 → 指令名补全', () => {
    const items = provideCompletions('start: ad', 9, stores, LABELS)
    expect(items.map((i) => i.label)).toContain('add')
  })

  it('跳转指令操作数位置 → 标签优先', () => {
    const items = provideCompletions('jmp ', 4, stores, LABELS)
    const labels = items.map((i) => i.label)
    expect(labels).toContain('_start')
    expect(labels).toContain('.done')
    expect(labels).not.toContain('mov')
  })

  it('跳转指令带前缀 → 按前缀过滤标签', () => {
    const items = provideCompletions('call pri', 8, stores, LABELS)
    expect(items.map((i) => i.label)).toEqual(['print_string'])
  })

  it('普通操作数位置 → 寄存器 + 标签', () => {
    const items = provideCompletions('mov rax, ', 9, stores, LABELS)
    const labels = items.map((i) => i.label)
    expect(labels).toContain('rax')
    expect(labels).toContain('rbx')
    expect(labels).toContain('_start')
  })

  it('操作数前缀同时过滤寄存器与标签', () => {
    const items = provideCompletions('mov rax, p', 10, stores, LABELS)
    const labels = items.map((i) => i.label)
    expect(labels).toEqual(['print_string'])
    expect(labels).not.toContain('rax')
  })

  it('注释内不提供补全', () => {
    expect(provideCompletions('mov rax, 1 ; ra', 15, stores, LABELS)).toEqual([])
    expect(provideCompletions('mov rax, 1 ; x', 12, stores, LABELS)).toEqual([])
    expect(provideCompletions('mov rax, ', 9, stores, LABELS).length).toBeGreaterThan(0)
  })

  it('标签同行时的跳转指令仍标签优先', () => {
    const items = provideCompletions('start: jmp ', 11, stores, ['dest'])
    const labels = items.map((i) => i.label)
    expect(labels).toContain('dest')
    expect(labels[0]).toBe('dest')
  })

  it('寄存器补全带位宽说明', () => {
    const items = provideCompletions('mov ', 4, stores, LABELS)
    const rax = items.find((i) => i.label === 'rax')!
    expect(rax.detail).toContain('64')
  })

  it('大小写不敏感前缀过滤', () => {
    const items = provideCompletions('MO', 2, stores, LABELS)
    expect(items.map((i) => i.label)).toContain('mov')
  })
})
