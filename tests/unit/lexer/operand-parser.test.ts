/**
 * 操作数解析器单元测试。
 */
import { describe, it, expect } from 'vitest'
import { tokenizeLine } from '../../../server/src/lexer/tokenizer'
import {
  parseOperandTokens,
  operandSignature,
  operandsSignature,
  parseImmediate
} from '../../../server/src/lexer/operand-parser'

function parse(text: string) {
  return parseOperandTokens(tokenizeLine(text))
}

describe('operand-parser', () => {
  it('寄存器：8/16/32/64 位识别与位宽', () => {
    expect(parse('al')).toMatchObject({ type: 'register', register: 'al', registerSize: 'byte' })
    expect(parse('ax')).toMatchObject({ type: 'register', registerSize: 'word' })
    expect(parse('eax')).toMatchObject({ type: 'register', registerSize: 'dword' })
    expect(parse('rax')).toMatchObject({ type: 'register', registerSize: 'qword' })
  })

  it('立即数：十进制/十六进制/二进制/字符', () => {
    expect(parse('123')).toMatchObject({ type: 'immediate', immediate: 123 })
    expect(parse('0x7B')).toMatchObject({ type: 'immediate', immediate: 123 })
    expect(parse('48h')).toMatchObject({ type: 'immediate', immediate: 72 })
    expect(parse('1010b')).toMatchObject({ type: 'immediate', immediate: 10 })
    expect(parse("'A'")).toMatchObject({ type: 'immediate', immediate: 65 })
    expect(parse('-8')).toMatchObject({ type: 'immediate', immediate: -8 })
  })

  it('parseImmediate 支持多进制与下划线分隔', () => {
    expect(parseImmediate('1_024')).toBe(1024)
    expect(parseImmediate('0o17')).toBe(15)
    expect(parseImmediate('17o')).toBe(15)
    expect(parseImmediate('777q')).toBe(511)
  })

  it('间接寻址 [rax]', () => {
    expect(parse('[rax]')).toMatchObject({
      type: 'memory',
      memory: { base: 'rax' }
    })
  })

  it('基址+位移 [rbp-8]', () => {
    expect(parse('[rbp-8]')).toMatchObject({
      type: 'memory',
      memory: { base: 'rbp', displacement: -8 }
    })
  })

  it('变址*比例 [rsi*4]', () => {
    expect(parse('[rsi*4]')).toMatchObject({
      type: 'memory',
      memory: { index: 'rsi', scale: 4 }
    })
  })

  it('完整 SIB [rbx+rcx*4+16]', () => {
    expect(parse('[rbx+rcx*4+16]')).toMatchObject({
      type: 'memory',
      memory: { base: 'rbx', index: 'rcx', scale: 4, displacement: 16 }
    })
  })

  it('直接寻址 [var] 与符号表达式 [msg+4]', () => {
    expect(parse('[var]')).toMatchObject({
      type: 'memory',
      memory: { displacement: 'var' }
    })
    expect(parse('[msg+4]')).toMatchObject({
      type: 'memory',
      memory: { displacement: 'msg+4' }
    })
  })

  it('RIP 相对 [rel msg]', () => {
    expect(parse('[rel msg]')).toMatchObject({
      type: 'memory',
      memory: { ripRelative: true, displacement: 'msg' }
    })
  })

  it('段覆盖 [fs:0x28]', () => {
    expect(parse('[fs:0x28]')).toMatchObject({
      type: 'memory',
      memory: { segment: 'fs', displacement: 40 }
    })
  })

  it('尺寸前缀 qword [rbp-8]', () => {
    expect(parse('qword [rbp-8]')).toMatchObject({
      type: 'memory',
      size: 'qword',
      memory: { base: 'rbp', displacement: -8 }
    })
  })

  it('标签引用与表达式', () => {
    expect(parse('msg')).toMatchObject({ type: 'label', label: 'msg' })
    expect(parse('$ - msg')).toMatchObject({ type: 'expression' })
    expect(operandSignature(parse('$ - msg'))).toBe('expr')
  })

  it('签名生成', () => {
    expect(operandSignature(parse('rax'))).toBe('reg')
    expect(operandSignature(parse('42'))).toBe('imm')
    expect(operandSignature(parse('[rbp-8]'))).toBe('mem')
    expect(operandSignature(parse('foo'))).toBe('label')
    expect(operandsSignature([parse('rax'), parse('42')])).toBe('reg,imm')
    expect(operandsSignature([])).toBe('')
  })
})
