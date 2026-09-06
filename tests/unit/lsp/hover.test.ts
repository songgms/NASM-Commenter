/**
 * Hover 单元测试：指令语义 / 寄存器约定 / 系统调用号（docs/07 §3.5.2）。
 */
import { describe, it, expect } from 'vitest'
import { hoverAt, syscallHover, defineHover } from '../../../server/src/lsp/hover'
import { getStores } from '../../helpers'

describe('hoverAt', () => {
  const stores = getStores()

  it('悬停指令名 → 语义 Markdown', () => {
    const md = hoverAt('    mov rax, 1', 6, 'linux-x64', stores)
    expect(md).toContain('`mov`')
    expect(md).toContain('数据传送')
    expect(md).toContain('标志位')
  })

  it('悬停寄存器 → ABI 角色说明', () => {
    const md = hoverAt('mov rax, 1', 5, 'linux-x64', stores)
    expect(md).toContain('rax')
    expect(md).toContain('返回值')
  })

  it('悬停系统调用号 → 调用名与参数（x64）', () => {
    const md = hoverAt('mov rax, 60', 10, 'linux-x64', stores)
    expect(md).toContain('`exit`')
    expect(md).toContain('60')
    expect(md).toContain('exit_code')
  })

  it('悬停系统调用号 → x86 int 0x80 约定', () => {
    const md = hoverAt('mov eax, 4', 9, 'linux-x86', stores)
    expect(md).toContain('`write`')
  })

  it('非系统调用立即数 → 回退指令 hover', () => {
    const md = hoverAt('mov rax, 9999', 11, 'linux-x64', stores)
    expect(md).toContain('`mov`')
  })

  it('悬停标签引用 → null', () => {
    expect(hoverAt('mov rsi, msg', 10, 'linux-x64', stores)).toBeNull()
  })

  it('macOS 基址编号 → 归一后显示', () => {
    const md = hoverAt('mov rax, 0x2000004', 13, 'macos-x64', stores)
    expect(md).toContain('`write`')
  })

  it('宏常量悬停显示定义值', () => {
    const defines = new Map([['BUF', '1024']])
    const md = hoverAt('    mov rax, BUF', 13, 'linux-x64', stores, { defines })
    expect(md).toContain('BUF')
    expect(md).toContain('1024')
  })

  it('宏常量优先于指令 hover', () => {
    const defines = new Map([['mov', 'xor']])
    const md = hoverAt('mov rax, 1', 1, 'linux-x64', stores, { defines })
    expect(md).toContain('宏常量')
  })

  it('defineHover 输出格式', () => {
    expect(defineHover('BUF', '1024')).toContain('= 1024')
  })

  it('syscallHover 组装参数与返回说明', () => {
    const md = syscallHover(1, { name: 'write', description: '写文件', args: ['fd', 'buf', 'count'], ret: '写入的字节数' })
    expect(md).toContain('(1)')
    expect(md).toContain('fd, buf, count')
    expect(md).toContain('写入的字节数')
  })
})
