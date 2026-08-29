/**
 * 数据定义伪指令：db / dw / dd / dq 与 resb / resw / resd / resq。
 * 结合标签名与参数值生成「定义 xx：值列表」注释。
 */
import { ruleResult } from './shared'
import type { HandlerFunction } from './shared'

interface DefineUnit {
  /** 单位中文名 */
  unit: string
  /** 是否为保留（未初始化） */
  reserve: boolean
}

const UNITS: Record<string, DefineUnit> = {
  db: { unit: '字节（8 位）数据', reserve: false },
  dw: { unit: '字（16 位）数据', reserve: false },
  dd: { unit: '双字（32 位）数据', reserve: false },
  dq: { unit: '四字（64 位）数据', reserve: false },
  dt: { unit: '十字节（80 位）数据', reserve: false },
  resb: { unit: '字节', reserve: true },
  resw: { unit: '字（16 位）', reserve: true },
  resd: { unit: '双字（32 位）', reserve: true },
  resq: { unit: '四字（64 位）', reserve: true }
}

function makeDefineHandler(mnemonic: string): HandlerFunction {
  return (line) => {
    const info = UNITS[mnemonic]
    if (info === undefined) {
      return null
    }
    const args = line.directiveArgs ?? []
    const label = line.label !== undefined ? `${line.label}：` : ''
    if (info.reserve) {
      const count = args.join(' ')
      return ruleResult(count.length > 0 ? `保留 ${count} 个${info.unit}未初始化空间` : `保留${info.unit}未初始化空间`)
    }
    if (args.length === 0) {
      return ruleResult(`定义${info.unit}`)
    }
    // 引号字符串参数 → 提示为字符串
    const isString = args.length >= 1 && (args[0].startsWith("'") || args[0].startsWith('"'))
    const values = args.join(', ')
    const kind = isString && mnemonic === 'db' ? '字符串' : info.unit
    return ruleResult(`定义${kind} ${label}${values}`.trim())
  }
}

export const handleDb = makeDefineHandler('db')
export const handleDw = makeDefineHandler('dw')
export const handleDd = makeDefineHandler('dd')
export const handleDq = makeDefineHandler('dq')
export const handleDt = makeDefineHandler('dt')
export const handleResb = makeDefineHandler('resb')
export const handleResw = makeDefineHandler('resw')
export const handleResd = makeDefineHandler('resd')
export const handleResq = makeDefineHandler('resq')
