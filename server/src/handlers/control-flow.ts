/**
 * 控制流指令：jmp / 条件跳转 jcc / call / ret / loop。
 * 条件跳转说明跳转条件；向后跳转（ctx.loop 命中）追加循环说明。
 */
import { generateFromTemplate, ruleResult } from './shared'
import type { HandlerFunction } from './shared'
import type { ParsedLine } from '../types'

function withLoopHint(line: ParsedLine, ctx: { loop?: { label: string; endLine: number } } | undefined, comment: string): string {
  if (ctx?.loop && ctx.loop.endLine === line.lineNumber) {
    return `${comment}（回跳到 ${ctx.loop.label} 构成循环）`
  }
  return comment
}

export const handleJmp: HandlerFunction = (line, ctx, stores, config) => {
  const result = generateFromTemplate('jmp', line, stores, config)
  if (result === null) {
    return null
  }
  return ruleResult(withLoopHint(line, ctx, result.comment), result.detail, result.commentEn)
}

function makeJccHandler(mnemonic: string): HandlerFunction {
  return (line, ctx, stores, config) => {
    const result = generateFromTemplate(mnemonic, line, stores, config)
    if (result === null) {
      return null
    }
    return ruleResult(withLoopHint(line, ctx, result.comment), result.detail, result.commentEn)
  }
}

export const handleJe = makeJccHandler('je')
export const handleJne = makeJccHandler('jne')
export const handleJz = makeJccHandler('jz')
export const handleJnz = makeJccHandler('jnz')
export const handleJg = makeJccHandler('jg')
export const handleJge = makeJccHandler('jge')
export const handleJl = makeJccHandler('jl')
export const handleJle = makeJccHandler('jle')
export const handleJa = makeJccHandler('ja')
export const handleJae = makeJccHandler('jae')
export const handleJb = makeJccHandler('jb')
export const handleJbe = makeJccHandler('jbe')
export const handleJs = makeJccHandler('js')
export const handleJns = makeJccHandler('jns')
export const handleJc = makeJccHandler('jc')
export const handleJnc = makeJccHandler('jnc')
export const handleJo = makeJccHandler('jo')
export const handleJno = makeJccHandler('jno')

export const handleCall: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('call', line, stores, config)

export const handleRet: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('ret', line, stores, config)

export const handleLoop: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('loop', line, stores, config)
