/**
 * 知识库数据校验器单元测试。
 */
import { describe, it, expect } from 'vitest'
import {
  validateInstructions,
  validatePatterns,
  validateSyscalls,
  validateRegisters
} from '../../../server/src/knowledge/validate'

describe('validateInstructions', () => {
  it('合法条目通过', () => {
    const { entries, issues } = validateInstructions({
      mov: {
        summary: '数据传送',
        description: '复制',
        category: 'data-transfer',
        flags_affected: 'none',
        templates: { 'reg,imm': '加载 {imm} 到 {dst}' }
      }
    }, 'test.json')
    expect(Object.keys(entries)).toEqual(['mov'])
    expect(issues).toHaveLength(0)
  })

  it('缺少 summary / category 非法 → 跳过条目', () => {
    const { entries, issues } = validateInstructions({
      bad: { description: 'x', category: 'data-transfer', flags_affected: 'none' },
      worse: { summary: 's', description: 'd', category: 'bogus', flags_affected: 'none' }
    }, 'test.json')
    expect(Object.keys(entries)).toHaveLength(0)
    expect(issues.length).toBeGreaterThanOrEqual(2)
  })

  it('非法模板变量被拒', () => {
    const { entries, issues } = validateInstructions({
      mov: {
        summary: 's', description: 'd', category: 'misc', flags_affected: 'none',
        templates: { 'reg,imm': '变量 {bogusVar}' }
      }
    }, 'test.json')
    expect(entries).toEqual({})
    expect(issues.some((i) => i.message.includes('bogusVar'))).toBe(true)
  })

  it('非法模板签名 key 被拒', () => {
    const { issues } = validateInstructions({
      mov: {
        summary: 's', description: 'd', category: 'misc', flags_affected: 'none',
        templates: { 'REG,IMM': 'x' }
      }
    }, 'test.json')
    expect(issues.some((i) => i.message.includes('签名 key 非法'))).toBe(true)
  })
})

describe('validatePatterns', () => {
  const valid = {
    id: 'p', name: '模式', sequence: ['mov', 'ret'],
    comments: ['a', 'b'], comments_en: ['a', 'b'], priority: 1, category: 'function'
  }

  it('合法模式通过', () => {
    const { patterns, issues } = validatePatterns([valid], 'p.json')
    expect(patterns).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('comments 长度不匹配被拒', () => {
    const { patterns, issues } = validatePatterns([{ ...valid, comments: ['a'] }], 'p.json')
    expect(patterns).toHaveLength(0)
    expect(issues[0].message).toContain('长度')
  })

  it('category 非法被拒', () => {
    const { patterns } = validatePatterns([{ ...valid, category: 'bogus' }], 'p.json')
    expect(patterns).toHaveLength(0)
  })
})

describe('validateSyscalls / validateRegisters', () => {
  it('系统调用编号必须纯数字', () => {
    const { table, issues } = validateSyscalls({ '1': { name: 'write' }, x: { name: 'bad' } }, 's.json')
    expect(Object.keys(table)).toEqual(['1'])
    expect(issues).toHaveLength(1)
  })

  it('系统调用条目必须有 name', () => {
    const { table, issues } = validateSyscalls({ '1': { args: [] } }, 's.json')
    expect(table).toEqual({})
    expect(issues).toHaveLength(1)
  })

  it('寄存器约定需要 callingConvention', () => {
    const ok = validateRegisters({
      'linux-x64': { callingConvention: { parameterRegisters: ['rdi'] } }
    }, 'r.json')
    expect(ok.issues).toHaveLength(0)
    const bad = validateRegisters({ 'linux-x64': {} }, 'r.json')
    expect(bad.issues).toHaveLength(1)
  })
})
