/**
 * 数据传送类指令：mov / xchg / push / pop / lea / movzx / movsx。
 * 全部由知识库模板驱动；lea 描述有效地址计算，push/pop 说明栈变化。
 * 已识别栈帧时 [rbp±N] 追加局部/参数提示；struc 字段引用追加偏移提示。
 */
import type { ParsedLine, LineContextData } from '../types'
import { findStructFieldRef } from '../context/struct-table'
import { generateFromTemplate, ruleResult } from './shared'
import type { HandlerFunction } from './shared'

/** 依据栈帧上下文为 [rbp±N] 内存操作数生成提示后缀。 */
function frameHint(line: ParsedLine, ctx: LineContextData | undefined): string {
  const frame = ctx?.stackFrame
  if (frame === undefined) {
    return ''
  }
  for (const op of line.operands) {
    if (op.type === 'memory' && op.memory?.base === frame.baseRegister && typeof op.memory.displacement === 'number') {
      const disp = op.memory.displacement
      if (disp < 0) {
        return `(局部变量 ${-disp})`
      }
      if (disp > 0) {
        return `(函数参数 ${disp})`
      }
    }
  }
  return ''
}

/** 依据结构体表为 `Struct.field` 引用生成偏移提示后缀。 */
function structHint(line: ParsedLine, ctx: LineContextData | undefined): string {
  const structs = ctx?.structs
  if (structs === undefined || structs.size === 0) {
    return ''
  }
  for (const op of line.operands) {
    const texts: string[] = []
    if (op.type === 'memory' && typeof op.memory?.displacement === 'string') {
      texts.push(op.memory.displacement)
    }
    if (op.type === 'label' || op.type === 'immediate' || op.type === 'expression') {
      texts.push(op.raw)
    }
    for (const text of texts) {
      const ref = findStructFieldRef(structs, text)
      if (ref !== null) {
        return `(${ref.ref}, 偏移 ${ref.field.offset}, 大小 ${ref.field.size})`
      }
    }
  }
  return ''
}

function extraHints(line: ParsedLine, ctx: LineContextData | undefined): string {
  return frameHint(line, ctx) + structHint(line, ctx)
}

function withHints(line: ParsedLine, ctx: LineContextData | undefined, comment: string): string {
  return comment + extraHints(line, ctx)
}

export const handleMov: HandlerFunction = (line, ctx, stores, config) => {
  const result = generateFromTemplate('mov', line, stores, config)
  if (result === null) {
    return null
  }
  return ruleResult(withHints(line, ctx, result.comment), result.detail, result.commentEn)
}

export const handleLea: HandlerFunction = (line, ctx, stores, config) => {
  const result = generateFromTemplate('lea', line, stores, config)
  if (result === null) {
    return null
  }
  return ruleResult(withHints(line, ctx, result.comment), result.detail, result.commentEn)
}

export const handleXchg: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('xchg', line, stores, config)

export const handlePush: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('push', line, stores, config)

export const handlePop: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('pop', line, stores, config)

export const handleMovzx: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('movzx', line, stores, config)

export const handleMovsx: HandlerFunction = (line, _ctx, stores, config) =>
  generateFromTemplate('movsx', line, stores, config)
