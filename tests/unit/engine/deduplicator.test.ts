/**
 * 去重器单元测试（无标记内容匹配 + 标记模式两种）。
 */
import { describe, it, expect } from 'vitest'
import {
  shouldSkip,
  existingComment,
  buildRemoveEdits
} from '../../../server/src/engine/deduplicator'
import { AUTO_MARKER } from '../../../server/src/engine/comment-formatter'

describe('existingComment', () => {
  it('提取行内注释（字符串中的分号不算）', () => {
    expect(existingComment('mov rax, 1    ; rax = 1')).toBe('rax = 1')
    expect(existingComment("db 'a;b' ; real")).toBe('real')
    expect(existingComment('mov rax, 1')).toBe('')
  })
})

describe('shouldSkip（无标记内容匹配）', () => {
  it('精确相等跳过', () => {
    expect(shouldSkip('mov rax, 1    ; rax = 1', 'rax = 1')).toBe(true)
    expect(shouldSkip('mov rax, 1    ; rax = 1', 'rax = 2')).toBe(false)
    expect(shouldSkip('mov rax, 1', 'rax = 1')).toBe(false)
  })

  it('追加形式（old / new）跳过', () => {
    expect(shouldSkip('mov rax, 1 ; user / rax = 1', 'rax = 1')).toBe(true)
    expect(shouldSkip('mov rax, 1 ; user / rax = 1', 'rax = 2')).toBe(false)
  })

  it('空生成内容不跳过', () => {
    expect(shouldSkip('mov rax, 1 ; x', '')).toBe(false)
  })
})

describe('shouldSkip（标记模式）', () => {
  const marker = `${AUTO_MARKER} `
  it('标记后内容一致跳过', () => {
    expect(shouldSkip(`mov rax, 1 ; ${marker}rax = 1`, 'rax = 1', marker)).toBe(true)
    expect(shouldSkip('mov rax, 1 ; rax = 1', 'rax = 1', marker)).toBe(false)
    expect(shouldSkip(`mov rax, 1 ; ${marker}rax = 1`, 'rax = 2', marker)).toBe(false)
  })
})

describe('buildRemoveEdits（标记模式）', () => {
  it('纯自动注释 → 整段移除（含对齐空白）', () => {
    const line = `mov rax, 1        ; ${AUTO_MARKER} rax = 1`
    const edits = buildRemoveEdits(line, 3, `${AUTO_MARKER} `)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ startLine: 3, startCharacter: 10, endCharacter: line.length, newText: '' })
  })

  it('用户注释 + 追加自动注释 → 只移除追加部分', () => {
    const line = `mov rax, 1 ; user note ${AUTO_MARKER} rax = 1`
    const edits = buildRemoveEdits(line, 0, `${AUTO_MARKER} `)
    expect(edits).toHaveLength(1)
    expect(edits[0].startCharacter).toBe(line.indexOf(AUTO_MARKER))
    expect(edits[0].newText).toBe('')
  })

  it('无标记 → 无编辑（内容匹配模式由 server 构造）', () => {
    expect(buildRemoveEdits('mov rax, 1 ; x', 0)).toHaveLength(0)
  })
})
