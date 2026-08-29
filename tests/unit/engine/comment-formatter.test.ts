/**
 * 注释格式化器单元测试。
 */
import { describe, it, expect } from 'vitest'
import { parseLine } from '../../../server/src/lexer/line-parser'
import { formatComment, alignColumn } from '../../../server/src/engine/comment-formatter'
import type { CommentResult, FormatOptions } from '../../../server/src/types'

const options: FormatOptions = {
  style: 'inline',
  language: 'zh',
  minColumn: 32,
  tabSize: 4,
  marker: '',
  verbose: false
}

const result: CommentResult = { comment: '将立即数 1 加载到 rax', confidence: 1.0, source: 'rule' }

describe('comment-formatter', () => {
  it('inline：在代码末尾插入并带对齐填充', () => {
    const line = parseLine('    mov rax, 1', 7)
    const formatted = formatComment(line, result, options, 32)
    expect(formatted.insertLine).toBe(7)
    expect(formatted.insertColumn).toBe(14) // 代码末尾(4 缩进 + 10 代码)
    expect(formatted.isNewline).toBe(false)
    expect(formatted.replaceEnd).toBeUndefined()
    expect(formatted.text.startsWith(' '.repeat(32 - 14))).toBe(true)
    expect(formatted.text).toContain('; 将立即数 1 加载到 rax')
  })

  it('代码超过对齐列时保留最少 2 空格', () => {
    const line = parseLine('mov rax, [rbx+rcx*8+0x1234]', 0)
    const formatted = formatComment(line, result, options, 10)
    expect(formatted.text.startsWith('  ; ')).toBe(true)
  })

  it('已有用户注释且不保护：替换为追加格式', () => {
    const line = parseLine('mov rax, 1 ; syscall', 0)
    const formatted = formatComment(line, result, options)
    expect(formatted.replaceEnd).toBe(line.raw.length)
    expect(formatted.insertColumn).toBe(line.raw.indexOf(';'))
    expect(formatted.text).toBe('; syscall / 将立即数 1 加载到 rax')
  })

  it('above：整行插入，缩进对齐', () => {
    const line = parseLine('    mov rax, 1', 7)
    const formatted = formatComment(line, result, { ...options, style: 'above' })
    expect(formatted.isNewline).toBe(true)
    expect(formatted.insertColumn).toBe(0)
    expect(formatted.text).toBe('    ; 将立即数 1 加载到 rax\n')
  })

  it('marker 配置时内容前附带标记', () => {
    const line = parseLine('mov rax, 1', 0)
    const formatted = formatComment(line, result, { ...options, marker: '[nasm-commenter] ' }, 32)
    expect(formatted.text).toContain('; [nasm-commenter] 将立即数 1 加载到 rax')
  })

  it('英文语言使用 commentEn', () => {
    const en: CommentResult = { ...result, comment: '中文', commentEn: 'load 1 into rax' }
    const line = parseLine('mov rax, 1', 0)
    const formatted = formatComment(line, en, { ...options, language: 'en' }, 32)
    expect(formatted.text).toContain('load 1 into rax')
  })

  it('verbose 模式附加 detail', () => {
    const detailed: CommentResult = { ...result, detail: '不影响标志位' }
    const line = parseLine('mov rax, 1', 0)
    const formatted = formatComment(line, detailed, { ...options, verbose: true }, 32)
    expect(formatted.text).toContain('(不影响标志位)')
  })

  it('alignColumn 计算范围内最长代码', () => {
    const lines = ['mov rax, 1', 'mov rax, [rbx+rcx*8]']
    expect(alignColumn(lines, 32)).toBe(Math.max(32, 'mov rax, [rbx+rcx*8]'.length + 2))
    expect(alignColumn(['a'], 32)).toBe(32)
  })
})
