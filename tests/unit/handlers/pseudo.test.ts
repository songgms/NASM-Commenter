/**
 * 伪指令 / 数据定义 / 标签 handler 单元测试。
 */
import { describe, it, expect } from 'vitest'
import { parseLine } from '../../../server/src/lexer/line-parser'
import { getHandler, annotateLabelLine } from '../../../server/src/handlers'
import { getStores, testConfig } from '../../helpers'
import type { LineContextData } from '../../../server/src/types'

describe('handlers/pseudo + data-define + label', () => {
  const stores = getStores()
  const config = testConfig()

  it('section / global / extern', () => {
    expect(getHandler('section')!(parseLine('section .text', 0), undefined, stores, config)?.comment)
      .toBe('声明代码段 .text')
    expect(getHandler('section')!(parseLine('section .bss', 0), undefined, stores, config)?.comment)
      .toBe('声明未初始化数据段 .bss')
    expect(getHandler('global')!(parseLine('global _start', 0), undefined, stores, config)?.comment)
      .toBe('导出符号 _start(链接器可见)')
    expect(getHandler('extern')!(parseLine('extern printf', 0), undefined, stores, config)?.comment)
      .toBe('声明外部符号 printf')
  })

  it('equ / times / align / bits / %define', () => {
    expect(getHandler('equ')!(parseLine('len equ $ - msg', 0), undefined, stores, config)?.comment)
      .toContain('定义常量 len')
    expect(getHandler('times')!(parseLine('times 10 db 0', 0), undefined, stores, config)?.comment)
      .toContain('重复 10 次')
    expect(getHandler('align')!(parseLine('align 16', 0), undefined, stores, config)?.comment)
      .toBe('对齐到 16 字节边界')
    expect(getHandler('bits')!(parseLine('bits 64', 0), undefined, stores, config)?.comment)
      .toBe('指定 64 位汇编模式')
    expect(getHandler('%define')!(parseLine('%define BUF 1024', 0), undefined, stores, config)?.comment)
      .toBe('定义宏常量 BUF = 1024')
  })

  it('db / dw / dd / dq 与 resb', () => {
    expect(getHandler('db')!(parseLine("msg db 'hi', 10", 0), undefined, stores, config)?.comment)
      .toBe("定义字符串 msg: 'hi', 10")
    expect(getHandler('dd')!(parseLine('arr dd 1, 2, 3', 0), undefined, stores, config)?.comment)
      .toBe('定义双字 (32 位) 数据 arr: 1, 2, 3')
    expect(getHandler('resb')!(parseLine('buf resb 64', 0), undefined, stores, config)?.comment)
      .toBe('保留 64 个字节未初始化空间')
  })

  it('leave / enter 栈帧语义', () => {
    expect(getHandler('leave')!(parseLine('leave', 0), undefined, stores, config)?.comment).toContain('恢复栈帧')
    expect(getHandler('enter')!(parseLine('enter 16, 0', 0), undefined, stores, config)?.comment).toContain('16')
  })

  it('标签行：函数入口 vs 跳转目标', () => {
    const fnCtx: LineContextData = { line: 4, inFunction: true, functionName: '_start', registers: {} }
    const start = parseLine('_start:', 4)
    const target = parseLine('.loop:', 9)
    expect(annotateLabelLine(start, fnCtx, stores, config)?.comment).toBe('函数入口: _start')
    expect(annotateLabelLine(target, { line: 9, inFunction: false, registers: {} }, stores, config)?.comment)
      .toBe('标签 .loop(跳转目标)')
  })
})
