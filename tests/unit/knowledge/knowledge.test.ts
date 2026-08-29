/**
 * 知识库 Store 单元测试：指令查询 / 系统调用 / 寄存器约定 / 模式。
 */
import { describe, it, expect } from 'vitest'
import { InstructionStore } from '../../../server/src/knowledge/instruction-store'
import { SyscallStore } from '../../../server/src/knowledge/syscall-store'
import { RegisterStore } from '../../../server/src/knowledge/register-store'
import { PatternStore } from '../../../server/src/knowledge/pattern-store'
import { getStores } from '../../helpers'
import type { InstructionSemantics, CommentPattern, SyscallTable } from '../../../server/src/types'

describe('instruction-store', () => {
  const stores = getStores()

  it('mnemonic 大小写不敏感', () => {
    expect(stores.instructions.get('MOV')).toBeDefined()
    expect(stores.instructions.has('Mov')).toBe(true)
  })

  it('getTemplate 精确签名', () => {
    expect(stores.instructions.getTemplate('mov', 'reg,imm')).toBe('将立即数 {imm} 加载到 {dst}')
    expect(stores.instructions.getTemplate('mov', 'reg,bogus')).toBeUndefined()
  })

  it('matchTemplate 通配回落与跨语言回落', () => {
    // 'mov reg,expr' 无精确模板 → 单位通配 '*,expr'? 不存在 → 'reg,*' → 不存在 → description 兜底由调用方处理
    // 这里验证 xchg reg,mem（仅有 templates 中 reg,mem）
    expect(stores.instructions.matchTemplate('xchg', 'reg,mem', 'zh')).toContain('交换')
    // en 缺失时回落 zh 模板
    expect(stores.instructions.matchTemplate('xchg', 'reg,mem', 'en')).toContain('交换')
  })

  it('getFlags 与 getAllMnemonics', () => {
    expect(stores.instructions.getFlags('add')).toBe('CF,OF,SF,ZF,AF,PF')
    expect(stores.instructions.getFlags('unknown-mnemonic')).toBe('unknown')
    expect(stores.instructions.getAllMnemonics().length).toBeGreaterThan(50)
  })

  it('空实例安全', () => {
    const empty = new InstructionStore({})
    expect(empty.get('mov')).toBeUndefined()
    expect(empty.matchTemplate('mov', 'reg,reg', 'zh')).toBeUndefined()
  })
})

describe('syscall-store', () => {
  const stores = getStores()

  it('x64 write=1 / exit=60', () => {
    expect(stores.syscalls.get('linux-x64', 1)?.name).toBe('write')
    expect(stores.syscalls.get('linux-x64', 60)?.name).toBe('exit')
    expect(stores.syscalls.has('linux-x64', 1)).toBe(true)
    expect(stores.syscalls.has('linux-x64', 99999)).toBe(false)
  })

  it('x86 (int 0x80) exit=1 / write=4', () => {
    expect(stores.syscalls.get('linux-x86', 1)?.name).toBe('exit')
    expect(stores.syscalls.get('linux-x86', 4)?.name).toBe('write')
  })

  it('macOS 基址归一（0x2000004 → write）', () => {
    expect(stores.syscalls.get('macos-x64', 0x2000004)?.name).toBe('write')
  })

  it('getByName', () => {
    expect(stores.syscalls.getByName('linux-x64', 'read')?.args).toEqual(['fd', 'buf', 'count'])
  })

  it('未知 ABI 安全', () => {
    const store = new SyscallStore({} as Record<string, SyscallTable>)
    expect(store.get('linux-x64', 1)).toBeUndefined()
  })
})

describe('register-store', () => {
  const stores = getStores()

  it('x64 参数序与系统调用参数序', () => {
    expect(stores.registers.getParameterRegister('linux-x64', 0)).toBe('rdi')
    expect(stores.registers.getParameterRegister('linux-x64', 5)).toBe('r9')
    expect(stores.registers.getSyscallNumberRegister('linux-x64')).toBe('rax')
    expect(stores.registers.getSyscallArgRegisters('linux-x64')).toEqual(['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9'])
    expect(stores.registers.getSyscallArgRegisters('linux-x86')).toEqual(['ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp'])
  })

  it('返回寄存器与角色说明', () => {
    expect(stores.registers.getReturnRegister('linux-x64')).toBe('rax')
    expect(stores.registers.getRegisterRole('linux-x64', 'RAX')).toContain('返回值')
  })
})

describe('pattern-store', () => {
  it('序列匹配与通配', () => {
    const patterns: CommentPattern[] = [{
      id: 'test-wild',
      name: '通配测试',
      description: '',
      sequence: ['mov', '*'],
      comments: ['a', 'b'],
      comments_en: ['a', 'b'],
      priority: 10,
      category: 'idiom'
    }]
    const store = new PatternStore(patterns)
    expect(store.match(['mov', 'push'])?.id).toBe('test-wild')
    expect(store.match(['push', 'mov'])).toBeUndefined()
  })

  it('约束校验：mustBe 不满足则不匹配', () => {
    const patterns: CommentPattern[] = [{
      id: 'c',
      name: '约束',
      description: '',
      sequence: ['mov'],
      operandConstraints: [{ index: 0, operand: 0, mustBe: 'rax' }],
      comments: ['x'],
      comments_en: ['x'],
      priority: 1,
      category: 'idiom'
    }]
    const store = new PatternStore(patterns)
    const hit = { lineNumber: 0, kind: 'instruction', mnemonic: 'mov', operands: [{ type: 'register', raw: 'rax' }], raw: '', label: undefined } as never
    const miss = { lineNumber: 0, kind: 'instruction', mnemonic: 'mov', operands: [{ type: 'register', raw: 'rbx' }], raw: '', label: undefined } as never
    expect(store.scanDocument([hit as never]).length).toBe(1)
    expect(store.scanDocument([miss as never]).length).toBe(0)
  })
})
