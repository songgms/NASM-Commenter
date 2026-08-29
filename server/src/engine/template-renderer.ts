/**
 * 模板渲染器：将注释模板中的变量与条件片段替换为实际值。
 *
 * 支持：
 * - 简单变量 {dst} {src} {imm} {mem} {label} {reg} {syscall} {count} {size}
 * - 上下文变量 {ctx:reg:rax}（取寄存器已知值，未知时保留寄存器名）
 * - 条件片段 {if:X==Y}A{else}B{endif}（操作符 ==、!=、contains，非嵌套）
 * - 未提供的变量保留原样（不报错）
 */
import type { Operand, TemplateVariables, CommentLanguage } from '../types'

const SIMPLE_VARS = ['dst', 'src', 'imm', 'mem', 'label', 'reg', 'syscall', 'count', 'size'] as const

const CONDITIONAL_RE = /\{if:([^}]+)\}([\s\S]*?)\{endif\}/g
const CTX_VAR_RE = /\{ctx:reg:([\w$]+)\}/g

/** 解析条件表达式 `X==Y` / `X!=Y` / `X contains Y`。 */
function evalCondition(cond: string, vars: TemplateVariables): boolean {
  const containsMatch = /^(.+?)\s+contains\s+(.+)$/.exec(cond)
  if (containsMatch) {
    const haystack = resolveSide(containsMatch[1].trim(), vars)
    const needle = resolveSide(containsMatch[2].trim(), vars)
    return haystack.includes(needle)
  }
  const opMatch = /^(.+?)(==|!=)(.+)$/.exec(cond)
  if (!opMatch) {
    return false
  }
  const left = resolveSide(opMatch[1].trim(), vars)
  const right = resolveSide(opMatch[3].trim(), vars)
  return opMatch[2] === '==' ? left === right : left !== right
}

/** 解析条件的一侧：变量名取其值，否则按字面量处理（去引号）。 */
function resolveSide(side: string, vars: TemplateVariables): string {
  const record = vars as Record<string, unknown>
  if (
    Object.prototype.hasOwnProperty.call(record, side) &&
    typeof record[side] === 'string' &&
    record[side] !== undefined &&
    record[side] !== ''
  ) {
    return record[side] as string
  }
  return side.replace(/^['"]|['"]$/g, '')
}

/** 渲染条件片段：每个 {if:...}...{endif} 选择匹配的分支。 */
function evalConditionals(template: string, vars: TemplateVariables): string {
  return template.replace(CONDITIONAL_RE, (_all, cond: string, body: string) => {    const elseIdx = body.indexOf('{else}')
    const whenTrue = elseIdx >= 0 ? body.slice(0, elseIdx) : body
    const whenFalse = elseIdx >= 0 ? body.slice(elseIdx + '{else}'.length) : ''
    return evalCondition(cond, vars) ? whenTrue : whenFalse
  })
}

/**
 * 渲染模板。顺序：条件片段 → 上下文变量 → 简单变量。
 */
export function renderTemplate(template: string, vars: TemplateVariables): string {
  let out = evalConditionals(template, vars)
  out = out.replace(CTX_VAR_RE, (_match: string, reg: string) => {
    const value = vars.ctx?.[reg.toLowerCase()]
    return value !== undefined && value !== '' ? String(value) : reg
  })
  for (const name of SIMPLE_VARS) {
    const value = vars[name]
    if (value === undefined || value === '') {
      continue // 未提供的变量保留原样
    }
    out = out.split(`{${name}}`).join(value)
  }
  return out
}

/**
 * 生成操作数的人类可读描述（兜底注释用）。
 */
export function describeOperand(operand: Operand, language: CommentLanguage = 'zh'): string {
  switch (operand.type) {
    case 'register':
      return language === 'en' ? `register ${operand.raw}` : `寄存器 ${operand.raw}`
    case 'immediate':
      return language === 'en' ? `immediate ${operand.raw}` : `立即数 ${operand.raw}`
    case 'memory':
      return language === 'en' ? `memory at ${operand.raw}` : `内存 ${operand.raw}`
    case 'label':
      return language === 'en' ? `label ${operand.raw}` : `标签 ${operand.raw}`
    default:
      return language === 'en' ? `expression ${operand.raw}` : `表达式 ${operand.raw}`
  }
}
