/**
 * 去掉所有注释单元测试。
 */
import { describe, it, expect } from 'vitest'
import { stripAllCommentsEdits } from '../../../server/src/engine/strip-comments'
import { applyEditsToText } from '../../../server/src/engine/deduplicator'

describe('stripAllCommentsEdits', () => {
  it('剥离行尾注释与其前导空白', () => {
    const src = '    mov rax, 1        ; 加载立即数\n    syscall'
    const edits = stripAllCommentsEdits(src)
    expect(edits).toHaveLength(1)
    expect(applyEditsToText(src, edits)).toBe('    mov rax, 1\n    syscall')
  })

  it('整行注释删除整行', () => {
    const src = ['a:', '    ; 说明行', '    nop'].join('\n')
    const edits = stripAllCommentsEdits(src)
    expect(edits).toHaveLength(1)
    expect(applyEditsToText(src, edits)).toBe('a:\n    nop')
  })

  it("字符串中的分号不受影响", () => {
    const src = "    db 'a;b'    ; 含分号字符串\n    nop"
    const edits = stripAllCommentsEdits(src)
    expect(edits).toHaveLength(1)
    const applied = applyEditsToText(src, edits)
    expect(applied).toBe("    db 'a;b'\n    nop")
  })

  it('仅含字符串分号的行不产生编辑', () => {
    expect(stripAllCommentsEdits("    db ';'")).toHaveLength(0)
  })

  it('无注释文档返回空', () => {
    expect(stripAllCommentsEdits('    nop\n    syscall')).toHaveLength(0)
  })

  it('全注释文档清空为空行', () => {
    const src = '; a\n; b'
    const edits = stripAllCommentsEdits(src)
    expect(applyEditsToText(src, edits)).toBe('')
  })
})
