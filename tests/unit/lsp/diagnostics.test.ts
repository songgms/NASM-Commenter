/**
 * 诊断单元测试：未知指令（Hint）与未定义跳转目标（Warning）。
 */
import { describe, it, expect } from 'vitest'
import { validateDocument } from '../../../server/src/lsp/diagnostics'
import { getStores } from '../../helpers'

const stores = getStores()

describe('validateDocument', () => {
  it('干净文档无诊断', () => {
    const src = [
      '_start:',
      '    mov rax, 1',
      '    mov rdi, 1',
      '    syscall'
    ].join('\n')
    expect(validateDocument(src, stores)).toEqual([])
  })

  it('未知指令 → Hint', () => {
    const src = '    mov rax, 1\n    vpermilpd xmm0, xmm1, 2\n    syscall'
    const diags = validateDocument(src, stores)
    const unknown = diags.find((d) => d.severity === 4)
    expect(unknown).toBeDefined()
    expect(unknown?.line).toBe(1)
    expect(unknown?.message).toContain('vpermilpd')
    expect(unknown?.length).toBe(9)
  })

  it('跳转到未定义标签 → Warning', () => {
    const src = '    jmp nowhere\nend:'
    const diags = validateDocument(src, stores)
    const warn = diags.find((d) => d.severity === 2)
    expect(warn).toBeDefined()
    expect(warn?.line).toBe(0)
    expect(warn?.message).toContain('nowhere')
    expect(warn?.character).toBe(8)
  })

  it('已定义的跳转目标不告警', () => {
    const src = 'top:\n    dec rcx\n    jnz top'
    expect(validateDocument(src, stores)).toEqual([])
  })

  it('带前缀指令（repne scasb）不误报未知', () => {
    const src = '    repne scasb'
    expect(validateDocument(src, stores)).toEqual([])
  })

  it('标签行与注释行不产生诊断', () => {
    const src = '; 注释\n.loop:\n    nop'
    expect(validateDocument(src, stores)).toEqual([])
  })
})
