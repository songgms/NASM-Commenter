/**
 * 行解析器单元测试。
 */
import { describe, it, expect } from 'vitest'
import { parseLine, parseDocument } from '../../../server/src/lexer/line-parser'
import { operandsSignature } from '../../../server/src/lexer/operand-parser'

describe('line-parser', () => {
  it('空行 / 纯注释行', () => {
    expect(parseLine('', 0).kind).toBe('empty')
    const comment = parseLine('; hello', 0)
    expect(comment.kind).toBe('comment-only')
    expect(comment.comment).toBe('hello')
  })

  it('标签单独成行', () => {
    expect(parseLine('loop_start:', 0)).toMatchObject({ kind: 'label', label: 'loop_start' })
    expect(parseLine('.loop:', 0)).toMatchObject({ kind: 'label', label: '.loop' })
  })

  it('标签与指令同行', () => {
    const line = parseLine('start: mov eax, 1', 0)
    expect(line).toMatchObject({ kind: 'instruction', label: 'start', mnemonic: 'mov' })
    expect(operandsSignature(line.operands)).toBe('reg,imm')
  })

  it('助记符统一转小写', () => {
    expect(parseLine('MOV RAX, 1', 0).mnemonic).toBe('mov')
  })

  it('多操作数分割（括号内逗号不分隔）', () => {
    const line = parseLine('mov [a+1], 2', 0)
    expect(line.operands).toHaveLength(2)
    expect(line.operands[0].raw).toBe('[a+1]')
    expect(line.operands[1].raw).toBe('2')
  })

  it('指令前缀 repne scasb', () => {
    const line = parseLine('repne scasb', 0)
    expect(line.mnemonic).toBe('scasb')
    expect(line.prefixes).toEqual(['repne'])
  })

  it('伪指令行', () => {
    const section = parseLine('section .text', 0)
    expect(section).toMatchObject({ kind: 'directive', directive: 'section', directiveArgs: ['.text'] })
    const def = parseLine('%define BUF 1024', 0)
    expect(def).toMatchObject({ kind: 'directive', directive: '%define', directiveArgs: ['BUF 1024'] })
  })

  it('数据定义与标签同行：msg db ...', () => {
    const line = parseLine("msg db 'hi', 10", 0)
    expect(line).toMatchObject({ kind: 'directive', label: 'msg', directive: 'db' })
    expect(line.directiveArgs).toEqual(["'hi'", '10'])
  })

  it('equ 定义：len equ $ - msg', () => {
    const line = parseLine('len equ $ - msg', 0)
    expect(line).toMatchObject({ kind: 'directive', label: 'len', directive: 'equ' })
    expect(line.directiveArgs?.join(' ')).toContain('$ - msg')
  })

  it('原有注释保留', () => {
    expect(parseLine('mov rax, 1 ; syscall write', 0).comment).toBe('syscall write')
  })

  it('indent 记录行首缩进', () => {
    expect(parseLine('    mov rax, 1', 0).indent).toBe('    ')
  })

  it('无法识别的行 → unknown 且不抛异常', () => {
    expect(parseLine('= = =', 0).kind).toBe('unknown')
  })

  it('parseDocument 解析多行并保持行号', () => {
    const lines = parseDocument('a:\nmov rax, 1\n\n; c')
    expect(lines).toHaveLength(4)
    expect(lines[0].kind).toBe('label')
    expect(lines[1].lineNumber).toBe(1)
    expect(lines[2].kind).toBe('empty')
    expect(lines[3].kind).toBe('comment-only')
  })
})
