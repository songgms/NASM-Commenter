/**
 * 寄存器追踪器单元测试。
 */
import { describe, it, expect } from 'vitest'
import { parseDocument } from '../../../server/src/lexer/line-parser'
import { trackRegisters, applyLine } from '../../../server/src/context/register-tracker'
import type { RegisterStateMap } from '../../../server/src/types'

function snapshots(src: string): Map<number, RegisterStateMap> {
  return trackRegisters(parseDocument(src))
}

describe('register-tracker', () => {
  it('mov reg,imm 常量传播', () => {
    const snap = snapshots('mov rax, 1\nsyscall')
    expect(snap.get(1)?.rax).toMatchObject({ value: 1, isConstant: true, kind: 'constant' })
  })

  it('xor reg,reg 清零', () => {
    const snap = snapshots('xor rdi, rdi\nsyscall')
    expect(snap.get(1)?.rdi).toMatchObject({ value: 0 })
  })

  it('别名：写入 eax 更新 rax', () => {
    const snap = snapshots('mov eax, 5\nadd eax, 3\nmov dword [x], eax')
    expect(snap.get(1)?.rax).toMatchObject({ value: 5 })
    expect(snap.get(2)?.rax).toMatchObject({ value: 8 })
  })

  it('add 常量更新', () => {
    const snap = snapshots('mov rax, 5\nadd rax, 3\nmov rbx, rax')
    expect(snap.get(1)?.rax).toMatchObject({ value: 5 })
    expect(snap.get(2)?.rax).toMatchObject({ value: 8 })
  })

  it('mov reg,label / lea → memory-ref', () => {
    const snap = snapshots('mov rsi, msg\nlea rdi, [rbp-8]\nnop')
    expect(snap.get(2)?.rsi).toMatchObject({ kind: 'memory-ref', value: 'msg' })
    expect(snap.get(2)?.rdi).toMatchObject({ kind: 'memory-ref' })
  })

  it('mov reg,reg 复制来源状态', () => {
    const snap = snapshots('mov rax, 7\nmov rbx, rax\nnop')
    expect(snap.get(2)?.rbx).toMatchObject({ value: 7 })
  })

  it('call 后 caller-saved 失效', () => {
    const snap = snapshots('mov rax, 1\ncall foo\nsyscall')
    expect(snap.get(2)?.rax?.isConstant).toBe(false)
  })

  it('跳转目标处状态重置', () => {
    const snap = snapshots('mov rax, 1\nloop_top:\nmov rbx, rax')
    // loop_top 是块入口 → 快照中 rax 无已知状态
    expect(snap.get(2)?.rax).toBeUndefined()
  })

  it('applyLine 不可变：不修改入参', () => {
    const lines = parseDocument('mov rax, 1')
    const state = {}
    applyLine(lines[0], state)
    expect(state).toEqual({})
  })
})
