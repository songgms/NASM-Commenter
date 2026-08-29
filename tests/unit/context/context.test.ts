/**
 * 函数追踪器 / 循环追踪器 / 文档上下文 / 模式匹配器单元测试。
 */
import { describe, it, expect } from 'vitest'
import { parseDocument } from '../../../server/src/lexer/line-parser'
import { trackFunctions } from '../../../server/src/context/function-tracker'
import { trackLoops } from '../../../server/src/context/loop-tracker'
import { DocumentContext } from '../../../server/src/context/document-context'
import { matchPatterns } from '../../../server/src/context/pattern-matcher'
import { getStores } from '../../helpers'

const SRC = [
  'section .text',
  '    global _start',
  '_start:',
  '    mov rcx, 10',
  'count_loop:',
  '    add rax, rcx',
  '    dec rcx',
  '    jnz count_loop',
  '    mov rax, 60',
  '    xor rdi, rdi',
  '    syscall'
].join('\n')

describe('function-tracker', () => {
  it('global 标签识别为函数入口，结束于下一入口或 ret', () => {
    const map = trackFunctions(parseDocument(SRC), 'linux-x64')
    expect(map.functions).toHaveLength(1)
    const fn = map.functions[0]
    expect(fn).toMatchObject({ name: '_start', startLine: 2 })
    expect(fn.endLine).toBeGreaterThanOrEqual(9)
  })

  it('函数参数：rdi/rsi 被读取时计入', () => {
    const src = [
      'global add_nums',
      'add_nums:',
      '    mov eax, edi',
      '    add eax, esi',
      '    ret'
    ].join('\n')
    const map = trackFunctions(parseDocument(src), 'linux-x64')
    expect(map.functions[0].parameterRegisters).toContain('rdi')
    expect(map.functions[0].parameterRegisters).toContain('rsi')
  })
})

describe('loop-tracker', () => {
  it('向后条件跳转识别为循环', () => {
    const loops = trackLoops(parseDocument(SRC))
    const info = loops.get(7) // jnz 行
    expect(info).toMatchObject({ label: 'count_loop', startLine: 4, endLine: 7 })
  })

  it('loop 指令带 rcx 计数器', () => {
    const loops = trackLoops(parseDocument('top:\nloop top'))
    expect(loops.get(1)).toMatchObject({ label: 'top', counterRegister: 'rcx' })
  })

  it('向前跳转不是循环', () => {
    const loops = trackLoops(parseDocument('    jmp end\nend:'))
    expect(loops.size).toBe(0)
  })
})

describe('document-context', () => {
  const stores = getStores()

  it('section 与函数归属', () => {
    const ctx = new DocumentContext(parseDocument(SRC), 'linux-x64', stores.syscalls)
    expect(ctx.getSectionAt(3)).toBe('.text')
    expect(ctx.getFunctionAt(5)?.name).toBe('_start')
    expect(ctx.getLabelAt(5)).toBe('count_loop')
  })

  it('getRegisterValue 取 syscall 前的常量', () => {
    const ctx = new DocumentContext(parseDocument(SRC), 'linux-x64', stores.syscalls)
    expect(ctx.getRegisterValue('rax', 10)).toBe('60')
  })

  it('syscall 回溯：调用号与参数值', () => {
    const src = [
      '    mov rax, 1',
      '    mov rdi, 1',
      '    mov rsi, msg',
      '    mov rdx, 12',
      '    syscall'
    ].join('\n')
    const ctx = new DocumentContext(parseDocument(src), 'linux-x64', stores.syscalls)
    const sc = ctx.getSyscallContext(4)
    expect(sc).not.toBeNull()
    expect(sc).toMatchObject({ number: 1, name: 'write' })
    expect(sc?.args?.[0]).toMatchObject({ register: 'rdi', value: 1, name: 'fd' })
    expect(sc?.args?.[2]?.value).toBe(12)
  })

  it('buildLineContexts 输出全行快照', () => {
    const ctx = new DocumentContext(parseDocument(SRC), 'linux-x64', stores.syscalls)
    const contexts = ctx.buildLineContexts()
    expect(contexts.size).toBe(SRC.split('\n').length)
    expect(contexts.get(3)?.inFunction).toBe(true)
    expect(contexts.get(3)?.functionName).toBe('_start')
  })
})

describe('pattern-matcher', () => {
  const stores = getStores()

  it('write 系统调用五连匹配', () => {
    const src = [
      '    mov rax, 1',
      '    mov rdi, 1',
      '    mov rsi, msg',
      '    mov rdx, len',
      '    syscall'
    ].join('\n')
    const matches = matchPatterns(parseDocument(src), stores)
    expect(matches.some((m) => m.pattern.id === 'write-syscall')).toBe(true)
  })

  it('read 序列不误配 write 模式（约束校验）', () => {
    const src = [
      '    mov rax, 0',
      '    mov rdi, 0',
      '    mov rsi, buf',
      '    mov rdx, 64',
      '    syscall'
    ].join('\n')
    const matches = matchPatterns(parseDocument(src), stores)
    expect(matches.some((m) => m.pattern.id === 'write-syscall')).toBe(false)
  })

  it('重叠冲突：高优先级模式胜出', () => {
    const src = [
      '    push rbp',
      '    mov rbp, rsp',
      '    sub rsp, 16'
    ].join('\n')
    const matches = matchPatterns(parseDocument(src), stores)
    // prologue(100) 覆盖后，叶函数 sub 模式(30)因重叠被排除
    expect(matches.some((m) => m.pattern.id === 'function-prologue-standard')).toBe(true)
    expect(matches.some((m) => m.pattern.id === 'function-prologue-leaf')).toBe(false)
  })

  it('strlen 模式（repne scasb 复合助记符）', () => {
    const src = '    repne scasb'.trim()
    const matches = matchPatterns(parseDocument(src), stores)
    expect(matches.some((m) => m.pattern.id === 'strlen-scan')).toBe(true)
  })
})
