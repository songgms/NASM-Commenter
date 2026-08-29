/**
 * 分词器单元测试（docs/07 §3.8 必须用例全覆盖）。
 */
import { describe, it, expect } from 'vitest'
import { tokenizeLine } from '../../../server/src/lexer/tokenizer'

const types = (line: string): string[] => tokenizeLine(line).map((t) => t.type)
const values = (line: string): string[] => tokenizeLine(line).map((t) => t.value)

describe('tokenizer', () => {
  it('空行产出空 token 数组', () => {
    expect(tokenizeLine('')).toEqual([])
    expect(tokenizeLine('   \t ')).toEqual([])
  })

  it('纯注释行 → 单个 comment token', () => {
    const tokens = tokenizeLine('; 整行注释')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].type).toBe('comment')
    expect(tokens[0].value).toBe('整行注释')
  })

  it('mov eax, 123 识别指令/寄存器/逗号/立即数', () => {
    expect(types('mov eax, 123')).toEqual([
      'identifier', 'register', 'comma', 'integer'
    ])
  })

  it('内存操作数 tokens', () => {
    expect(types('mov [rbp-8], rax')).toEqual([
      'identifier', 'lbracket', 'register', 'minus', 'integer', 'rbracket', 'comma', 'register'
    ])
  })

  it('代码 + 注释分离', () => {
    const tokens = tokenizeLine('add rax, rbx ; 加法')
    expect(values('add rax, rbx')).toEqual(tokens.slice(0, 4).map((t) => t.value))
    expect(tokens[4].type).toBe('comment')
    expect(tokens[4].value).toBe('加法')
  })

  it("字符串中的分号不当作注释：db 'hello;world'", () => {
    const tokens = tokenizeLine("db 'hello;world'")
    expect(tokens.map((t) => t.type)).toEqual(['identifier', 'string'])
    expect(tokens[1].value).toBe("'hello;world'")
  })

  it('十进制 / 十六进制 0x 与 h 后缀', () => {
    expect(values('mov eax, 0x7B')).toContain('0x7B')
    expect(values('mov eax, 48h')).toContain('48h')
    expect(types('mov eax, 123')).toContain('integer')
  })

  it('二进制 b 后缀（1010b）', () => {
    expect(values('mov eax, 1010b')).toContain('1010b')
  })

  it('寄存器大小写不敏感', () => {
    expect(types('MOV EAX, RBX').filter((t) => t === 'register')).toHaveLength(2)
  })

  it('尺寸前缀识别', () => {
    expect(types('qword [rbp-8]')[0]).toBe('size-prefix')
    expect(types('byte [rsi]')[0]).toBe('size-prefix')
  })

  it('段覆盖（后跟冒号）识别为 segment', () => {
    expect(types('[fs:0x28]')).toEqual(['lbracket', 'segment', 'colon', 'integer', 'rbracket'])
    // 段寄存器不带冒号时是普通寄存器
    expect(types('mov fs, ax')[1]).toBe('register')
  })

  it('$ 与 $$ 特殊 token', () => {
    expect(types('len equ $ - msg')).toContain('dollar')
    expect(tokenizeLine('section $$')[1].type).toBe('dollar')
  })

  it('%define 识别为 directive token', () => {
    expect(types('%define BUF 1024')[0]).toBe('directive')
  })

  it('unknown 字符不抛异常', () => {
    expect(types('mov @# x')).toContain('unknown')
  })

  it('token 携带位置信息', () => {
    const tokens = tokenizeLine('mov rax, 1')
    expect(tokens[0].start).toBe(0)
    expect(tokens[0].end).toBe(3)
    expect(tokens[1].start).toBe(4)
  })
})
