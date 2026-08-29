/**
 * 去重器单元测试。
 */
import { describe, it, expect } from 'vitest'
import {
  shouldSkip,
  extractAutoComments,
  buildRemoveEdits
} from '../../../server/src/engine/deduplicator'

describe('deduplicator', () => {
  it('提取自动注释内容', () => {
    expect(extractAutoComments('mov rax, 1    ; [nasm-commenter] rax = 1')).toEqual(['rax = 1'])
    expect(extractAutoComments('mov rax, 1 ; 用户注释')).toEqual([])
    expect(extractAutoComments("db 'a;b' ; [nasm-commenter] x")).toEqual(['x'])
  })

  it('已有相同注释时跳过', () => {
    expect(shouldSkip('mov rax, 1 ; [nasm-commenter] rax = 1', 'rax = 1')).toBe(true)
    expect(shouldSkip('mov rax, 1 ; [nasm-commenter] rax = 1', 'rax = 2')).toBe(false)
    expect(shouldSkip('mov rax, 1', 'rax = 1')).toBe(false)
  })

  it('纯自动注释 → 整段移除（含对齐空白）', () => {
    const line = 'mov rax, 1        ; [nasm-commenter] rax = 1'
    const edits = buildRemoveEdits(line, 3)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ startLine: 3, startCharacter: 10, endCharacter: line.length, newText: '' })
  })

  it('用户注释 + 追加自动注释 → 只移除自动部分', () => {
    const line = 'mov rax, 1 ; user note [nasm-commenter] rax = 1'
    const edits = buildRemoveEdits(line, 0)
    expect(edits).toHaveLength(1)
    expect(edits[0].startCharacter).toBe(line.indexOf('[nasm-commenter]'))
    expect(edits[0].newText).toBe('')
  })

  it('无自动注释 → 无编辑', () => {
    expect(buildRemoveEdits('mov rax, 1 ; 用户注释', 0)).toHaveLength(0)
    expect(buildRemoveEdits('mov rax, 1', 0)).toHaveLength(0)
  })
})
