/**
 * 虚拟注释（Inlay Hint 预览）单元测试。
 */
import { describe, it, expect } from 'vitest'
import { parseDocument } from '../../../server/src/lexer/line-parser'
import { provideVirtualComments } from '../../../server/src/lsp/inlay-hints'
import { annotateSource } from '../../../server/src/engine/comment-engine'
import { getStores, testConfig } from '../../helpers'

const stores = getStores()

function virtualOf(src: string) {
  const ann = annotateSource(src, stores, testConfig())
  return provideVirtualComments(ann.lines, ann.comments, stores)
}

describe('provideVirtualComments', () => {
  it('在代码末尾生成虚拟注释，带 ; 前缀与指令 tooltip', () => {
    const hints = virtualOf('    mov rax, 1')
    expect(hints).toHaveLength(1)
    expect(hints[0]).toMatchObject({ line: 0, character: 14, label: '; 将立即数 1 加载到 rax' })
    expect(hints[0].tooltip).toContain('`mov`')
  })

  it('已有真实注释的行不重复预览', () => {
    const hints = virtualOf('    mov rax, 1 ; 我的注释')
    expect(hints).toHaveLength(0)
  })

  it('空行/纯注释行无预览', () => {
    const hints = virtualOf('\n; 注释\n\n    nop')
    expect(hints).toHaveLength(1)
    expect(hints[0].line).toBe(3)
  })

  it('多行文档行号对应正确', () => {
    const src = ['section .text', '_start:', '    mov rax, 60', '    syscall'].join('\n')
    const hints = virtualOf(src)
    const byLine = new Map(hints.map((h) => [h.line, h]))
    expect(byLine.get(2)?.label).toContain('将立即数 60')
    expect(byLine.get(3)?.label).toContain('调用 exit')
  })
})

describe('annotateSource 供虚拟层使用（保护关闭生成全部结果）', () => {
  it('带注释行也返回结果（供跳过判断）', () => {
    const ann = annotateSource('    mov rax, 1 ; x', stores, testConfig({ protectExistingComments: false }))
    expect(ann.comments.get(0)).toBeDefined()
  })
})
