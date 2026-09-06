/**
 * 知识库数据结构校验（loader 启动时调用；scripts/validate-schema.js 使用等价逻辑）。
 *
 * 校验失败的单条数据跳过并记录 issue，不中断加载（降级可用）。
 */
import type {
  CommentPattern,
  InstructionEntry,
  InstructionSemantics,
  SyscallTable,
  RegisterConventions
} from '../types'

/** 校验问题。 */
export interface ValidationIssue {
  /** 所属数据文件名 */
  file: string
  /** 出问题的条目 key（指令名 / 模式 id / 系统调用号） */
  key: string
  message: string
}

/** 允许的指令类别。 */
const CATEGORIES = new Set([
  'data-transfer', 'arithmetic', 'logic', 'control-flow', 'stack',
  'string', 'system', 'fpu', 'simd', 'privileged', 'misc'
])

/** 操作数签名 key：逗号分隔的 reg/imm/mem/label/expr，或通配符 *；空字符串表示无操作数指令。 */
const SIGNATURE_KEY_RE = /^$|^[a-z*]+(,[a-z*]+)*$/
/** 模板变量引用：{var} / {ctx:xxx:yyy} / {if:...}{else}{endif}。 */
const TEMPLATE_TOKEN_RE = /\{[^}]*\}/g
const SIMPLE_VAR_RE = /^\{(dst|src|src2|imm|mem|label|reg|syscall|count|size)\}$/
const CTX_VAR_RE = /^\{ctx:[a-z]+:[\w$]+\}$/
const CONDITIONAL_RE = /^\{(if|else|endif)[^}]*\}$/

/** 校验模板字符串中的变量引用是否都在允许集合内。 */
function validateTemplateVars(template: string, file: string, key: string, issues: ValidationIssue[]): void {
  const tokens = template.match(TEMPLATE_TOKEN_RE) ?? []
  for (const token of tokens) {
    if (SIMPLE_VAR_RE.test(token) || CTX_VAR_RE.test(token) || CONDITIONAL_RE.test(token)) {
      continue
    }
    issues.push({ file, key, message: `非法模板变量 ${token}` })
  }
}

/** 校验指令语义表，返回合法条目。 */
export function validateInstructions(
  raw: unknown,
  file: string
): { entries: InstructionSemantics; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const entries: InstructionSemantics = {}
  if (typeof raw !== 'object' || raw === null) {
    issues.push({ file, key: '(root)', message: '指令语义表必须是 JSON 对象' })
    return { entries, issues }
  }
  const record = raw as Record<string, unknown>
  for (const [mnemonic, value] of Object.entries(record)) {
    if (typeof value !== 'object' || value === null) {
      issues.push({ file, key: mnemonic, message: '条目必须是对象' })
      continue
    }
    const entry = value as Partial<InstructionEntry>
    const name = mnemonic.toLowerCase()
    let bad = 0
    const fail = (key: string, message: string): void => {
      issues.push({ file, key, message })
      bad++
    }
    if (!entry.summary || typeof entry.summary !== 'string') {
      fail(name, '缺少 summary')
    }
    if (!entry.description || typeof entry.description !== 'string') {
      fail(name, '缺少 description')
    }
    if (!entry.category || !CATEGORIES.has(entry.category)) {
      fail(name, `category 非法: ${String(entry.category)}`)
    }
    if (typeof entry.flags_affected !== 'string') {
      fail(name, '缺少 flags_affected')
    }
    for (const field of ['templates', 'templates_en'] as const) {
      const templates = entry[field]
      if (templates === undefined) {
        continue
      }
      if (typeof templates !== 'object' || templates === null) {
        fail(name, `${field} 必须是对象`)
        continue
      }
      for (const [sig, tpl] of Object.entries(templates)) {
        if (typeof tpl !== 'string') {
          fail(`${name}.${sig}`, '模板必须是字符串')
          continue
        }
        if (!SIGNATURE_KEY_RE.test(sig)) {
          fail(`${name}.${sig}`, `模板签名 key 非法: ${sig}`)
          continue
        }
        const before = issues.length
        validateTemplateVars(tpl, file, `${name}.${sig}`, issues)
        if (issues.length > before) {
          bad++
        }
      }
    }
    if (bad === 0) {
      entries[name] = entry as InstructionEntry
    }
  }
  return { entries, issues }
}

/** 校验模式表，返回合法条目。 */
export function validatePatterns(
  raw: unknown,
  file: string
): { patterns: CommentPattern[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const patterns: CommentPattern[] = []
  if (!Array.isArray(raw)) {
    issues.push({ file, key: '(root)', message: '模式表必须是 JSON 数组' })
    return { patterns, issues }
  }
  const categories = new Set(['function', 'loop', 'syscall', 'string', 'idiom'])
  raw.forEach((value, idx) => {
    const key = `#${idx}`
    if (typeof value !== 'object' || value === null) {
      issues.push({ file, key, message: '模式必须是对象' })
      return
    }
    const p = value as Partial<CommentPattern>
    if (!p.id || typeof p.id !== 'string') {
      issues.push({ file, key, message: '缺少 id' })
      return
    }
    const idKey = p.id
    if (!p.name || typeof p.name !== 'string') {
      issues.push({ file, key: idKey, message: '缺少 name' })
      return
    }
    if (!Array.isArray(p.sequence) || p.sequence.length === 0 || p.sequence.some((s) => typeof s !== 'string')) {
      issues.push({ file, key: idKey, message: 'sequence 必须是非空字符串数组' })
      return
    }
    if (!Array.isArray(p.comments) || p.comments.length !== p.sequence.length) {
      issues.push({ file, key: idKey, message: 'comments 长度必须与 sequence 一致' })
      return
    }
    if (!Array.isArray(p.comments_en) || p.comments_en.length !== p.sequence.length) {
      issues.push({ file, key: idKey, message: 'comments_en 长度必须与 sequence 一致' })
      return
    }
    if (typeof p.priority !== 'number') {
      issues.push({ file, key: idKey, message: '缺少 priority (数字)' })
      return
    }
    if (!p.category || !categories.has(p.category)) {
      issues.push({ file, key: idKey, message: `category 非法: ${String(p.category)}` })
      return
    }
    for (const tpl of [...p.comments, ...p.comments_en]) {
      validateTemplateVars(tpl, file, idKey, issues)
    }
    patterns.push(p as CommentPattern)
  })
  return { patterns, issues }
}

/** 校验系统调用表（key 必须是十进制编号），返回合法条目。 */
export function validateSyscalls(
  raw: unknown,
  file: string
): { table: SyscallTable; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const table: SyscallTable = {}
  if (typeof raw !== 'object' || raw === null) {
    issues.push({ file, key: '(root)', message: '系统调用表必须是 JSON 对象' })
    return { table, issues }
  }
  for (const [num, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(num)) {
      issues.push({ file, key: num, message: '系统调用编号必须是纯数字' })
      continue
    }
    if (typeof value !== 'object' || value === null || typeof (value as { name?: unknown }).name !== 'string') {
      issues.push({ file, key: num, message: '系统调用条目必须有 name' })
      continue
    }
    table[num] = value as { name: string; description?: string; args?: string[]; ret?: string }
  }
  return { table, issues }
}

/** 校验寄存器约定表。 */
export function validateRegisters(
  raw: unknown,
  file: string
): { conventions: RegisterConventions; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const conventions: RegisterConventions = {}
  if (typeof raw !== 'object' || raw === null) {
    issues.push({ file, key: '(root)', message: '寄存器约定必须是 JSON 对象' })
    return { conventions, issues }
  }
  const record = raw as Record<string, unknown>
  for (const [abi, value] of Object.entries(record)) {
    if (typeof value !== 'object' || value === null) {
      issues.push({ file, key: abi, message: 'ABI 条目必须是对象' })
      continue
    }
    const conv = (value as { callingConvention?: unknown }).callingConvention
    if (typeof conv !== 'object' || conv === null || !Array.isArray((conv as { parameterRegisters?: unknown }).parameterRegisters)) {
      issues.push({ file, key: abi, message: '缺少 callingConvention.parameterRegisters' })
      continue
    }
    conventions[abi] = value as RegisterConventions[string]
  }
  return { conventions, issues }
}
