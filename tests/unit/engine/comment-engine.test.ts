/**
 * 注释引擎单元测试（docs/07 §3.8 指定用例）。
 */
import { describe, it, expect } from 'vitest'
import { parseDocument } from '../../../server/src/lexer/line-parser'
import { CommentEngine } from '../../../server/src/engine/comment-engine'
import { getStores, testConfig } from '../../helpers'

describe('comment-engine', () => {
  const stores = getStores()
  const config = testConfig()

  it('空行返回 null', () => {
    const engine = new CommentEngine(stores)
    expect(engine.annotateLine(parseDocument('')[0], undefined, config)).toBeNull()
    expect(engine.annotateLine(parseDocument('   ')[0], undefined, config)).toBeNull()
  })

  it('纯注释行返回 null', () => {
    const engine = new CommentEngine(stores)
    expect(engine.annotateLine(parseDocument('; hello')[0], undefined, config)).toBeNull()
  })

  it('未知指令用兜底注释（confidence 0.3）', () => {
    const engine = new CommentEngine(stores)
    const result = engine.annotateLine(parseDocument('    vpermilpd xmm0, xmm1, 2', 0)[0], undefined, config)
    expect(result).not.toBeNull()
    expect(result?.source).toBe('fallback')
    expect(result?.confidence).toBe(0.3)
    expect(result?.comment).toContain('vpermilpd')
  })

  it('已有注释保护（默认开启）→ skipped', () => {
    const engine = new CommentEngine(stores)
    const result = engine.annotateLine(parseDocument('mov rax, 1 ; 我的注释', 0)[0], undefined, config)
    expect(result?.skipped).toBe(true)
    expect(result?.skipReason).toBe('已有注释')
  })

  it('关闭保护时已有用户注释仍生成（追加格式）', () => {
    const engine = new CommentEngine(stores)
    const cfg = testConfig({ protectExistingComments: false })
    const result = engine.annotateLine(parseDocument('mov rax, 1 ; 我的注释', 0)[0], undefined, cfg)
    expect(result?.skipped).toBeUndefined()
    expect(result?.comment).toBe('将立即数 1 加载到 rax')
  })

  it('已有相同自动注释时跳过（幂等）', () => {
    const engine = new CommentEngine(stores)
    const line = parseDocument('mov rax, 1    ; 将立即数 1 加载到 rax', 0)[0]
    const result = engine.annotateLine(line, undefined, config)
    expect(result?.skipped).toBe(true)
    expect(result?.skipReason).toBe('注释未变化')
  })

  it('有模板的伪指令生成注释，未知伪指令为 null', () => {
    const engine = new CommentEngine(stores)
    expect(engine.annotateLine(parseDocument('section .text', 0)[0], undefined, config)?.comment)
      .toBe('声明代码段 .text')
    expect(engine.annotateLine(parseDocument('cpu 686', 0)[0], undefined, config)).toBeNull()
  })
})
