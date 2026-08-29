/**
 * 字符串指令：movs/cmps/scas/lods/stos 系列与 cld/std。
 * rep/repe/repne 前缀（line.prefixes）追加重复语义说明。
 */
import { generateFromTemplate, ruleResult } from './shared'
import type { HandlerFunction } from './shared'

const PREFIX_DESC: Record<string, string> = {
  rep: '重复 rcx 次',
  repe: '条件重复 (相等时继续)',
  repne: '条件重复 (不等时继续)',
  repnz: '条件重复 (不等时继续)',
  lock: ''
}

function makeStringHandler(mnemonic: string): HandlerFunction {
  return (line, ctx, stores, config) => {
    const result = generateFromTemplate(mnemonic, line, stores, config)
    if (result === null) {
      return null
    }
    let comment = result.comment
    const prefix = line.prefixes?.[0]
    if (prefix !== undefined && PREFIX_DESC[prefix]) {
      const count = ctx?.registers.rcx?.value
      comment = count !== undefined
        ? `${comment}(${PREFIX_DESC[prefix]}, rcx = ${String(count)})`
        : `${comment}(${PREFIX_DESC[prefix]})`
    }
    return ruleResult(comment, result.detail, result.commentEn)
  }
}

export const handleMovsb = makeStringHandler('movsb')
export const handleMovsw = makeStringHandler('movsw')
export const handleMovsd = makeStringHandler('movsd')
export const handleCmpsb = makeStringHandler('cmpsb')
export const handleCmpsw = makeStringHandler('cmpsw')
export const handleCmpsd = makeStringHandler('cmpsd')
export const handleScasb = makeStringHandler('scasb')
export const handleScasd = makeStringHandler('scasd')
export const handleLodsb = makeStringHandler('lodsb')
export const handleLodsd = makeStringHandler('lodsd')
export const handleStosb = makeStringHandler('stosb')
export const handleStosd = makeStringHandler('stosd')
export const handleCld: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('cld', line, stores, config)
export const handleStd: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('std', line, stores, config)
