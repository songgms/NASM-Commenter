/**
 * 系统类指令：syscall / int / nop / hlt / cpuid / cli / sti。
 * syscall 与 int 0x80 结合上下文回溯结果生成「调用名(参数值)：说明」注释。
 */
import type { SyscallContext } from '../types'
import { generateFromTemplate, ruleResult } from './shared'
import type { HandlerFunction } from './shared'

/** 由系统调用回溯上下文构建 `调用 name(args)：说明` 注释。 */
function syscallComment(ctxSyscall: SyscallContext, stores: { syscalls: { getByName(abi: SyscallContext['abi'], name: string): { description?: string } | undefined } }): string {
  const name = ctxSyscall.name ?? (ctxSyscall.number !== undefined ? `syscall ${ctxSyscall.number}` : 'syscall')
  const argTexts = (ctxSyscall.args ?? []).map((a) =>
    a.value !== undefined ? String(a.value) : a.register
  )
  const base = `调用 ${name}(${argTexts.join(', ')})`
  const info = ctxSyscall.name !== undefined
    ? stores.syscalls.getByName(ctxSyscall.abi, ctxSyscall.name)
    : undefined
  return info?.description !== undefined ? `${base}：${info.description}` : base
}

export const handleSyscall: HandlerFunction = (line, ctx, stores, config) => {
  if (ctx?.syscall) {
    return ruleResult(syscallComment(ctx.syscall, stores))
  }
  return generateFromTemplate('syscall', line, stores, config)
}

export const handleInt: HandlerFunction = (line, ctx, stores, config) => {
  const imm = line.operands[0]
  if (ctx?.syscall && imm?.type === 'immediate' && imm.immediate === 0x80) {
    return ruleResult(syscallComment(ctx.syscall, stores))
  }
  return generateFromTemplate('int', line, stores, config)
}

export const handleNop: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('nop', line, stores, config)

export const handleHlt: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('hlt', line, stores, config)

export const handleCpuid: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('cpuid', line, stores, config)

export const handleCli: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('cli', line, stores, config)

export const handleSti: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('sti', line, stores, config)
