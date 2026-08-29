/**
 * 预处理器（简化版）单元测试。
 */
import { describe, it, expect } from 'vitest'
import { createPreprocessorState, preprocessLine } from '../../../server/src/lexer/preprocessor'

describe('preprocessor', () => {
  it('%define 收集定义并原样返回', () => {
    const state = createPreprocessorState()
    const line = '%define BUF 1024'
    expect(preprocessLine(line, state)).toBe(line)
  })

  it('定义后的整词替换', () => {
    const state = createPreprocessorState()
    preprocessLine('%define BUF 1024', state)
    expect(preprocessLine('mov rax, BUF', state)).toBe('mov rax, 1024')
  })

  it('只替换整词（BUF2 不被替换）', () => {
    const state = createPreprocessorState()
    preprocessLine('%define BUF 1024', state)
    expect(preprocessLine('mov rax, BUF2', state)).toBe('mov rax, BUF2')
  })

  it('字符串内的标识符不被替换', () => {
    const state = createPreprocessorState()
    preprocessLine('%define BUF 1024', state)
    expect(preprocessLine("db 'BUF'", state)).toBe("db 'BUF'")
  })

  it('未定义标识符保持原样', () => {
    const state = createPreprocessorState()
    expect(preprocessLine('mov rax, UNKNOWN', state)).toBe('mov rax, UNKNOWN')
  })
})
