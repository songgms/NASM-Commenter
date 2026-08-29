/**
 * 伪指令处理：section / global / extern / equ / times / align / bits / default / %define / %include / %macro。
 * 结合 directiveArgs 生成具体说明。
 */
import { ruleResult } from './shared'
import type { HandlerFunction } from './shared'
import type { ParsedLine } from '../types'

const SECTION_NAMES: Record<string, string> = {
  '.text': '代码段',
  '.data': '已初始化数据段',
  '.bss': '未初始化数据段',
  '.rodata': '只读数据段'
}

function firstArg(line: ParsedLine): string {
  return line.directiveArgs?.[0] ?? ''
}

function sectionComment(line: ParsedLine): ReturnType<typeof ruleResult> {
  const arg = firstArg(line)
  const desc = SECTION_NAMES[arg.toLowerCase()] ?? '段'
  return ruleResult(`声明${desc} ${arg}`.trim())
}

export const handleSection: HandlerFunction = (line) => sectionComment(line)

export const handleSegment: HandlerFunction = (line) => sectionComment(line)

export const handleGlobal: HandlerFunction = (line) => {
  const names = (line.directiveArgs ?? []).join(', ')
  return ruleResult(names.length > 0 ? `导出符号 ${names}(链接器可见)` : '导出符号')
}

export const handleExtern: HandlerFunction = (line) => {
  const names = (line.directiveArgs ?? []).join(', ')
  return ruleResult(names.length > 0 ? `声明外部符号 ${names}` : '声明外部符号')
}

export const handleEqu: HandlerFunction = (line) => {
  const value = (line.directiveArgs ?? []).join(' ')
  return ruleResult(`定义常量 ${line.label ?? ''} = ${value}`.trim())
}

export const handleTimes: HandlerFunction = (line) => {
  const args = line.directiveArgs ?? []
  // 仅取重复次数（首个词），忽略后续的数据定义
  const count = (args[0] ?? '').split(/\s+/)[0] ?? ''
  return ruleResult(count.length > 0 ? `将后续数据定义重复 ${count} 次` : '重复执行后续数据定义')
}

export const handleAlign: HandlerFunction = (line) => {
  const arg = firstArg(line)
  return ruleResult(arg.length > 0 ? `对齐到 ${arg} 字节边界` : '对齐到指定字节边界')
}

export const handleBits: HandlerFunction = (line) => {
  const arg = firstArg(line)
  return ruleResult(arg.length > 0 ? `指定 ${arg} 位汇编模式` : '指定汇编位数')
}

export const handleDefault: HandlerFunction = (line) => {
  const args = (line.directiveArgs ?? []).join(' ')
  return ruleResult(args.length > 0 ? `设置默认操作数/地址大小: ${args}` : '设置默认操作数/地址大小')
}

export const handleDefine: HandlerFunction = (line) => {
  const body = (line.directiveArgs ?? []).join(' ')
  const m = /^([a-zA-Z_.$?@][\w.$?@]*)(?:\s+(.*))?$/.exec(body)
  if (m) {
    return ruleResult(m[2] !== undefined ? `定义宏常量 ${m[1]} = ${m[2]}` : `定义宏 ${m[1]}`)
  }
  return ruleResult('定义单行宏')
}

export const handleInclude: HandlerFunction = (line) => {
  const arg = firstArg(line)
  return ruleResult(arg.length > 0 ? `包含文件 ${arg}` : '包含外部文件')
}

export const handleMacro: HandlerFunction = (line) => {
  const arg = firstArg(line)
  return ruleResult(arg.length > 0 ? `定义多行宏 ${arg}` : '定义多行宏')
}
