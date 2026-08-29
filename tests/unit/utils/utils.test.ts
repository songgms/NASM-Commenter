/**
 * utils 单元测试：indent / hash / abi-detector / config-defaults / logger。
 */
import { describe, it, expect } from 'vitest'
import { parseDocument } from '../../../server/src/lexer/line-parser'
import {
  calculateCommentColumn,
  hasExistingComment,
  stripExistingComment,
  findCommentStart
} from '../../../server/src/utils/indent'
import { hashString } from '../../../server/src/utils/hash'
import { detectABI, MACOS_SYSCALL_BASE } from '../../../server/src/utils/abi-detector'
import { resolveConfig, defaultCommentConfig } from '../../../server/src/utils/config-defaults'
import { createLogger } from '../../../server/src/utils/logger'

describe('indent', () => {
  it('字符串中的分号不是注释', () => {
    expect(hasExistingComment("db 'a;b'")).toBe(false)
    expect(hasExistingComment("db 'a;b' ; real")).toBe(true)
    expect(findCommentStart("db 'a;b'", )).toBe(-1)
  })

  it("转义单引号 '' 处理", () => {
    expect(hasExistingComment("db 'it''s' ; ok")).toBe(true)
    expect(stripExistingComment("db 'it''s' ; ok")).toBe("db 'it''s'")
  })

  it('calculateCommentColumn：空行/纯标签 → 0', () => {
    expect(calculateCommentColumn('', 32)).toBe(0)
    expect(calculateCommentColumn('foo:', 32)).toBe(0)
  })

  it('calculateCommentColumn：有代码 → max(minColumn, len+2)', () => {
    expect(calculateCommentColumn('mov rax, 1', 32)).toBe(32)
    expect(calculateCommentColumn('mov rax, [rbx+rcx*8+0x1234]', 32)).toBe(32)
    expect(calculateCommentColumn('mov rax, [rbx+rcx*8+0x1234567890]', 32)).toBe(35)
  })
})

describe('hash', () => {
  it('确定性 + 十六进制格式', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).toMatch(/^[0-9a-f]{8}$/)
    expect(hashString('abc')).not.toBe(hashString('abd'))
  })
})

describe('abi-detector', () => {
  it('syscall → linux-x64 默认', () => {
    expect(detectABI(parseDocument('syscall'))).toBe('linux-x64')
  })

  it('int 0x80 → linux-x86', () => {
    expect(detectABI(parseDocument('int 0x80'))).toBe('linux-x86')
    expect(detectABI(parseDocument('mov eax, 1\nint 0x80'))).toBe('linux-x86')
  })

  it('bits 32 → linux-x86', () => {
    expect(detectABI(parseDocument('bits 32'))).toBe('linux-x86')
  })

  it('mov rax, 0x2000000+ → macos-x64', () => {
    expect(detectABI(parseDocument(`mov rax, ${MACOS_SYSCALL_BASE + 4}\nsyscall`))).toBe('macos-x64')
  })

  it('空文档 → linux-x64', () => {
    expect(detectABI(parseDocument(''))).toBe('linux-x64')
  })
})

describe('config-defaults', () => {
  it('默认配置与部分合并', () => {
    const merged = resolveConfig({ language: 'en', style: 'above' })
    expect(merged.language).toBe('en')
    expect(merged.style).toBe('above')
    expect(merged.minColumn).toBe(defaultCommentConfig().minColumn)
    expect(merged.llm.enabled).toBe(false)
  })
})

describe('logger', () => {
  it('分级过滤不抛异常', () => {
    const log = createLogger('error')
    expect(() => log.debug('x')).not.toThrow()
    expect(() => log.error('boom', 1, 'a')).not.toThrow()
  })
})
