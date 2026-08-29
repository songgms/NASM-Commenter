/**
 * 模板渲染器单元测试。
 */
import { describe, it, expect } from 'vitest'
import { renderTemplate, describeOperand } from '../../../server/src/engine/template-renderer'
import type { TemplateVariables } from '../../../server/src/types'
import type { Operand } from '../../../server/src/types'

describe('template-renderer', () => {
  it('简单变量替换', () => {
    expect(renderTemplate('将 {src} 加到 {dst}', { dst: 'rax', src: 'rbx' })).toBe('将 rbx 加到 rax')
  })

  it('未提供的变量保留原样', () => {
    expect(renderTemplate('加载 {imm} 到 {dst}', { dst: 'rax' })).toBe('加载 {imm} 到 rax')
  })

  it('上下文变量 {ctx:reg:rax}', () => {
    const vars: TemplateVariables = { ctx: { rax: '1' } }
    expect(renderTemplate('调用号 {ctx:reg:rax}', vars)).toBe('调用号 1')
  })

  it('上下文变量未知时保留寄存器名', () => {
    expect(renderTemplate('调用号 {ctx:reg:rcx}', {})).toBe('调用号 rcx')
  })

  it('条件片段 {if:dst==src} 清零识别', () => {
    const tpl = '{if:dst==src}{dst} 清零{else}{dst} = {dst} XOR {src}{endif}'
    expect(renderTemplate(tpl, { dst: 'rax', src: 'rax' })).toBe('rax 清零')
    expect(renderTemplate(tpl, { dst: 'rax', src: 'rbx' })).toBe('rax = rax XOR rbx')
  })

  it('条件片段 == / != / contains', () => {
    expect(renderTemplate('{if:imm==0x80}中断{else}其他{endif}', { imm: '0x80' })).toBe('中断')
    expect(renderTemplate('{if:imm!=0x80}其他{endif}', { imm: '0x80' })).toBe('')
    expect(renderTemplate('{if:src contains rbp}栈访问{endif}', { src: '[rbp-8]' })).toBe('栈访问')
  })

  it('describeOperand 中英描述', () => {
    const reg: Operand = { type: 'register', raw: 'rax' }
    const mem: Operand = { type: 'memory', raw: '[rbp-8]' }
    expect(describeOperand(reg)).toBe('寄存器 rax')
    expect(describeOperand(mem, 'en')).toBe('memory at [rbp-8]')
  })
})
