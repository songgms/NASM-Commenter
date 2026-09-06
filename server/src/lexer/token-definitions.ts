/**
 * Token 常量表：寄存器、尺寸前缀、段寄存器、伪指令、指令前缀。
 */

/** 重新导出 Token 类型供词法模块内部使用。 */
export type { Token, TokenType } from '../types'

/** 寄存器信息。 */
export interface RegisterInfo {
  /** 位宽 */
  bits: number
  category: 'general' | 'segment' | 'simd' | 'fpu' | 'mmx' | 'special'
  /** 上级寄存器（如 eax → rax） */
  parent?: string
}

function buildRegisters(): Map<string, RegisterInfo> {
  const map = new Map<string, RegisterInfo>()

  // 64 位通用寄存器
  const base64 = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi', 'rbp', 'rsp']
  for (const r of base64) {
    map.set(r, { bits: 64, category: 'general' })
  }
  for (let i = 8; i <= 15; i++) {
    map.set(`r${i}`, { bits: 64, category: 'general' })
  }
  // 32 位
  const parent32: Record<string, string> = {
    eax: 'rax', ebx: 'rbx', ecx: 'rcx', edx: 'rdx',
    esi: 'rsi', edi: 'rdi', ebp: 'rbp', esp: 'rsp'
  }
  for (const [r, p] of Object.entries(parent32)) {
    map.set(r, { bits: 32, category: 'general', parent: p })
  }
  for (let i = 8; i <= 15; i++) {
    map.set(`r${i}d`, { bits: 32, category: 'general', parent: `r${i}` })
  }
  // 16 位
  const parent16: Record<string, string> = {
    ax: 'rax', bx: 'rbx', cx: 'rcx', dx: 'rdx',
    si: 'rsi', di: 'rdi', bp: 'rbp', sp: 'rsp'
  }
  for (const [r, p] of Object.entries(parent16)) {
    map.set(r, { bits: 16, category: 'general', parent: p })
  }
  for (let i = 8; i <= 15; i++) {
    map.set(`r${i}w`, { bits: 16, category: 'general', parent: `r${i}` })
  }
  // 8 位
  const parent8: Record<string, string> = {
    al: 'rax', ah: 'rax', bl: 'rbx', bh: 'rbx', cl: 'rcx', ch: 'rcx',
    dl: 'rdx', dh: 'rdx', spl: 'rsp', bpl: 'rbp', sil: 'rsi', dil: 'rdi'
  }
  for (const [r, p] of Object.entries(parent8)) {
    map.set(r, { bits: 8, category: 'general', parent: p })
  }
  for (let i = 8; i <= 15; i++) {
    map.set(`r${i}b`, { bits: 8, category: 'general', parent: `r${i}` })
  }

  // 段寄存器
  for (const s of ['cs', 'ds', 'es', 'fs', 'gs', 'ss']) {
    map.set(s, { bits: 16, category: 'segment' })
  }

  // SIMD / MMX / FPU
  for (let i = 0; i <= 31; i++) {
    map.set(`zmm${i}`, { bits: 512, category: 'simd' })
  }
  for (let i = 0; i <= 15; i++) {
    map.set(`xmm${i}`, { bits: 128, category: 'simd' })
    map.set(`ymm${i}`, { bits: 256, category: 'simd' })
  }
  for (let i = 0; i <= 7; i++) {
    map.set(`mm${i}`, { bits: 64, category: 'mmx' })
    map.set(`st${i}`, { bits: 80, category: 'fpu' })
  }

  // 特殊
  map.set('rip', { bits: 64, category: 'special' })
  map.set('eip', { bits: 32, category: 'special' })
  map.set('rflags', { bits: 64, category: 'special' })
  map.set('eflags', { bits: 32, category: 'special' })
  map.set('flags', { bits: 16, category: 'special' })
  return map
}

/** 全部寄存器映射（key 小写）。 */
export const REGISTERS: ReadonlyMap<string, RegisterInfo> = buildRegisters()

/** 是否为寄存器（大小写不敏感）。 */
export function isRegister(name: string): boolean {
  return REGISTERS.has(name.toLowerCase())
}

/** 尺寸前缀 → 位宽。 */
export const SIZE_PREFIXES: Readonly<Record<string, number>> = {
  byte: 8,
  word: 16,
  dword: 32,
  qword: 64,
  tword: 80,
  oword: 128,
  yword: 256,
  zword: 512
}

export function isSizePrefix(name: string): boolean {
  return name.toLowerCase() in SIZE_PREFIXES
}

/** 段寄存器集合（段覆盖 / 段内寻址用）。 */
export const SEGMENT_REGISTERS: ReadonlySet<string> = new Set(['cs', 'ds', 'es', 'fs', 'gs', 'ss'])

/** 指令前缀（与助记符同行时前置解析）。 */
export const INSTRUCTION_PREFIXES: ReadonlySet<string> = new Set(['lock', 'rep', 'repe', 'repne', 'repnz', 'notrack'])

/** NASM 伪指令集合（小写；% 开头的预处理指令单独识别）。 */
export const PSEUDO_INSTRUCTIONS: ReadonlySet<string> = new Set([
  'section', 'segment', 'global', 'extern', 'equ', 'times', 'align', 'bits', 'struc', 'endstruc', 'at',
  'default', 'cpu', 'absolute', 'incbin',
  'db', 'dw', 'dd', 'dq', 'dt', 'do', 'dy', 'dz',
  'resb', 'resw', 'resd', 'resq', 'rest', 'reso', 'resy', 'resz'
])

/** 数据定义伪指令（可与标签同行）。 */
export const DATA_DEFINES: ReadonlySet<string> = new Set([
  'db', 'dw', 'dd', 'dq', 'dt', 'do', 'dy', 'dz',
  'resb', 'resw', 'resd', 'resq', 'rest', 'reso', 'resy', 'resz', 'equ'
])

/** 是否为伪指令（含 % 开头）。 */
export function isPseudoInstruction(name: string): boolean {
  const n = name.toLowerCase()
  return n.startsWith('%') || PSEUDO_INSTRUCTIONS.has(n)
}

/** 标识符字符集（NASM 允许 . _ $ ? @）。 */
export const IDENT_START_RE = /^[a-zA-Z_.$?@%]$/
export const IDENT_PART_RE = /^[a-zA-Z0-9_.$?@]$/
