/**
 * 集成测试：对每个 fixture 执行完整管线并与期望输出对比。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { annotateSource, buildEdits } from '../../server/src/engine/comment-engine'
import { applyEditsToText, getStores, testConfig } from '../helpers'

const FIXTURE_DIR = path.join(__dirname, 'fixtures')

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, `${name}.asm`), 'utf-8')
}

function loadExpected(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, `${name}.expected.asm`), 'utf-8')
}

const FIXTURES = ['hello-world', 'function-call', 'loop', 'syscall', 'mixed'] as const

describe('integration: engine end-to-end', () => {
  const stores = getStores()
  const config = testConfig()

  for (const name of FIXTURES) {
    it(`${name} 注释输出与期望文件一致`, () => {
      const source = loadFixture(name)
      const ann = annotateSource(source, stores, config)
      const edits = buildEdits(ann.lines, ann.comments, config)
      const actual = applyEditsToText(source, edits)
      expect(actual).toBe(loadExpected(name))
    })
  }

  it('hello-world：write/exit 模式命中', () => {
    const ann = annotateSource(loadFixture('hello-world'), stores, config)
    expect(ann.abi).toBe('linux-x64')
    expect(ann.matches.map((m) => m.pattern.id)).toContain('write-syscall')
    expect(ann.matches.map((m) => m.pattern.id)).toContain('exit-syscall-xor')
    const syscallLine = ann.lines.findIndex((l) => l.mnemonic === 'syscall')
    expect(ann.comments.get(syscallLine)?.comment).toContain('执行 write 系统调用')
  })

  it('function-call：栈帧序言与参数寄存器', () => {
    const ann = annotateSource(loadFixture('function-call'), stores, config)
    expect(ann.matches.map((m) => m.pattern.id)).toContain('function-prologue-standard')
    const fn = ann.context.getFunctions().find((f) => f.name === 'add_numbers')
    expect(fn).toBeDefined()
    expect(fn?.parameterRegisters).toContain('rdi')
    expect(fn?.parameterRegisters).toContain('rsi')
  })

  it('loop：循环回跳注释', () => {
    const ann = annotateSource(loadFixture('loop'), stores, config)
    const jnzLine = ann.lines.find((l) => l.mnemonic === 'jnz' && l.operands[0]?.label === 'sum_loop')
    expect(jnzLine).toBeDefined()
    expect(ann.comments.get(jnzLine!.lineNumber)?.comment).toContain('构成循环')
  })

  it('syscall：read 调用经上下文回溯解析', () => {
    const ann = annotateSource(loadFixture('syscall'), stores, config)
    const firstSyscall = ann.lines.find((l) => l.mnemonic === 'syscall')
    const result = ann.comments.get(firstSyscall!.lineNumber)
    expect(result?.comment).toContain('调用 read(')
    expect(result?.comment).toContain('读文件')
  })

  it('mixed：%define 行注释、strlen 模式命中', () => {
    const ann = annotateSource(loadFixture('mixed'), stores, config)
    expect(ann.matches.map((m) => m.pattern.id)).toContain('strlen-scan')
    const defineLine = ann.lines.find((l) => l.directive === '%define')
    expect(ann.comments.get(defineLine!.lineNumber)?.comment).toContain('SYS_EXIT = 60')
  })

  it('统计：commentedLines 与 skippedLines 合理', () => {
    const ann = annotateSource(loadFixture('hello-world'), stores, config)
    expect(ann.stats.commentedLines).toBeGreaterThan(10)
    expect(ann.stats.skippedLines).toBe(0)
    expect(ann.stats.bySource.pattern).toBeGreaterThan(0)
    expect(ann.stats.bySource.rule).toBeGreaterThan(0)
  })

  it('已有自动注释的文件幂等（再次注释不产生新编辑）', () => {
    const source = loadFixture('hello-world')
    const ann = annotateSource(source, stores, config)
    const once = applyEditsToText(source, buildEdits(ann.lines, ann.comments, config))
    const ann2 = annotateSource(once, stores, config)
    const edits2 = buildEdits(ann2.lines, ann2.comments, config)
    expect(edits2).toHaveLength(0)
  })

  it('选区范围：仅注释指定行', () => {
    const source = loadFixture('hello-world')
    const ann = annotateSource(source, stores, config, { startLine: 10, endLine: 12 })
    expect(ann.comments.size).toBeLessThanOrEqual(3)
  })

  it('above 样式：整行插入且不留行内注释', () => {
    const source = loadFixture('hello-world')
    const cfg = testConfig({ style: 'above' })
    const ann = annotateSource(source, stores, cfg)
    const edits = buildEdits(ann.lines, ann.comments, cfg)
    expect(edits.length).toBeGreaterThan(0)
    for (const e of edits) {
      expect(e.startCharacter).toBe(0)
      expect(e.endCharacter).toBe(0)
      expect(e.newText).toMatch(/^[ \t]*; /)
      expect(e.newText.endsWith('\n')).toBe(true)
    }
    const applied = applyEditsToText(source, edits)
    // 新增行数 = 编辑数；所有含标记的行都是上方注释行
    expect(applied.split('\n').length).toBe(source.split('\n').length + edits.length)
    for (const line of applied.split('\n')) {
      if (line.includes('; [') || line.trimStart().startsWith('; ')) {
        expect(line.trimStart().startsWith('; ')).toBe(true)
      }
    }
  })
})
