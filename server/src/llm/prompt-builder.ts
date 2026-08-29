/**
 * Prompt 构建器：系统提示 + 单条指令上下文提示。
 * 要求 LLM 只返回注释文本（≤30 个汉字），无法确定返回空串。
 */
import type { CommentLanguage } from '../types'
import type { LLMRequest } from './adapter'

const SYSTEM_PROMPT_ZH = [
  '你是一个汇编语言注释助手。根据给定的 NASM 汇编指令和上下文，生成一行简洁的中文注释。',
  '要求：',
  '1. 注释不超过 30 个汉字',
  '2. 说明指令做了什么，而不是指令名翻译',
  '3. 如果是系统调用，说明调用功能',
  '4. 只返回注释文本，不要加引号或分号',
  '5. 如果无法确定，返回空字符串'
].join('\n')

const SYSTEM_PROMPT_EN = [
  'You are an assembly commenting assistant. Given a NASM instruction and its context,',
  'write one concise English comment for it.',
  'Rules:',
  '1. Keep it under 20 words',
  '2. Explain what the instruction does, not a translation of its name',
  '3. For syscalls, explain the call purpose',
  '4. Return only the comment text, no quotes or semicolons',
  '5. Return an empty string if uncertain'
].join('\n')

/** 系统提示词。 */
export function buildSystemPrompt(language: CommentLanguage): string {
  return language === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH
}

/** 用户提示词：指令 + 操作数 + 上下文代码。 */
export function buildUserPrompt(request: LLMRequest): string {
  const lines = [
    `ABI: ${request.abi}`,
    `指令: ${request.instruction}`,
    `操作数: ${request.operands.join(', ') || '(无)'}`
  ]
  if (request.context.length > 0) {
    lines.push('上下文代码:')
    lines.push(request.context)
  }
  lines.push(request.language === 'en' ? '请为以上指令生成英文注释。' : '请为以上指令生成中文注释。')
  return lines.join('\n')
}
