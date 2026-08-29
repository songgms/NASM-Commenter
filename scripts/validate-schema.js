#!/usr/bin/env node
/**
 * 知识库数据验证脚本（零依赖，CI 与贡献者本地运行）。
 *
 * 与 server/src/knowledge/validate.ts 保持等价的校验逻辑：
 * - instruction-semantics.json：必填字段、category 枚举、模板签名 key、模板变量白名单
 * - patterns.json：comments 长度与 sequence 一致、priority、category 枚举
 * - syscalls/*.json：编号为纯数字、条目含 name
 * - register-conventions.json：每个 ABI 含 callingConvention
 *
 * 退出码：0=通过，1=存在错误。
 */
'use strict'

const fs = require('fs')
const path = require('path')

const CATEGORIES = new Set([
  'data-transfer', 'arithmetic', 'logic', 'control-flow', 'stack',
  'string', 'system', 'fpu', 'simd', 'privileged', 'misc'
])
const SIGNATURE_KEY_RE = /^$|^[a-z*]+(,[a-z*]+)*$/
const TEMPLATE_TOKEN_RE = /\{[^}]*\}/g
const SIMPLE_VAR_RE = /^\{(dst|src|imm|mem|label|reg|syscall|count|size)\}$/
const CTX_VAR_RE = /^\{ctx:[a-z]+:[\w$]+\}$/
const CONDITIONAL_RE = /^\{(if|else|endif)[^}]*\}$/

const errors = []

function fail(file, key, msg) {
  errors.push(`${file} [${key}] ${msg}`)
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    fail(path.basename(file), '(root)', `JSON 解析失败: ${e.message}`)
    return null
  }
}

function checkTemplateVars(template, file, key) {
  const tokens = template.match(TEMPLATE_TOKEN_RE) || []
  for (const token of tokens) {
    if (SIMPLE_VAR_RE.test(token) || CTX_VAR_RE.test(token) || CONDITIONAL_RE.test(token)) continue
    fail(file, key, `非法模板变量 ${token}`)
  }
}

function checkInstructions(data, file) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(file, '(root)', '指令语义表必须是 JSON 对象')
    return 0
  }
  let count = 0
  for (const [mnemonic, entry] of Object.entries(data)) {
    const name = mnemonic.toLowerCase()
    if (typeof entry !== 'object' || entry === null) {
      fail(file, name, '条目必须是对象')
      continue
    }
    if (!entry.summary) fail(file, name, '缺少 summary')
    if (!entry.description) fail(file, name, '缺少 description')
    if (!CATEGORIES.has(entry.category)) fail(file, name, `category 非法: ${entry.category}`)
    if (typeof entry.flags_affected !== 'string') fail(file, name, '缺少 flags_affected')
    for (const field of ['templates', 'templates_en']) {
      const table = entry[field]
      if (table === undefined) continue
      if (typeof table !== 'object' || table === null) {
        fail(file, name, `${field} 必须是对象`)
        continue
      }
      for (const [sig, tpl] of Object.entries(table)) {
        if (!SIGNATURE_KEY_RE.test(sig)) fail(file, `${name}.${sig}`, `模板签名 key 非法: ${sig}`)
        if (typeof tpl !== 'string') {
          fail(file, `${name}.${sig}`, '模板必须是字符串')
          continue
        }
        checkTemplateVars(tpl, file, `${name}.${sig}`)
      }
    }
    count++
  }
  return count
}

function checkPatterns(data, file) {
  if (!Array.isArray(data)) {
    fail(file, '(root)', '模式表必须是 JSON 数组')
    return 0
  }
  const categories = new Set(['function', 'loop', 'syscall', 'string', 'idiom'])
  let count = 0
  data.forEach((p, idx) => {
    const key = p && p.id ? p.id : `#${idx}`
    if (typeof p !== 'object' || p === null) {
      fail(file, key, '模式必须是对象')
      return
    }
    if (!p.id) fail(file, key, '缺少 id')
    if (!p.name) fail(file, key, '缺少 name')
    if (!Array.isArray(p.sequence) || p.sequence.length === 0) fail(file, key, 'sequence 必须是非空数组')
    if (!Array.isArray(p.comments) || (p.sequence && p.comments.length !== p.sequence.length)) {
      fail(file, key, 'comments 长度必须与 sequence 一致')
    }
    if (!Array.isArray(p.comments_en) || (p.sequence && p.comments_en.length !== p.sequence.length)) {
      fail(file, key, 'comments_en 长度必须与 sequence 一致')
    }
    if (typeof p.priority !== 'number') fail(file, key, '缺少 priority')
    if (!categories.has(p.category)) fail(file, key, `category 非法: ${p.category}`)
    for (const tpl of [...(p.comments || []), ...(p.comments_en || [])]) {
      checkTemplateVars(tpl, file, key)
    }
    count++
  })
  return count
}

function checkSyscalls(data, file) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(file, '(root)', '系统调用表必须是 JSON 对象')
    return 0
  }
  let count = 0
  for (const [num, info] of Object.entries(data)) {
    if (!/^\d+$/.test(num)) {
      fail(file, num, '系统调用编号必须是纯数字')
      continue
    }
    if (typeof info !== 'object' || info === null || typeof info.name !== 'string') {
      fail(file, num, '系统调用条目必须有 name')
      continue
    }
    count++
  }
  return count
}

function checkRegisters(data, file) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(file, '(root)', '寄存器约定必须是 JSON 对象')
    return 0
  }
  let count = 0
  for (const [abi, entry] of Object.entries(data)) {
    const conv = entry && entry.callingConvention
    if (typeof conv !== 'object' || conv === null || !Array.isArray(conv.parameterRegisters)) {
      fail(file, abi, '缺少 callingConvention.parameterRegisters')
      continue
    }
    count++
  }
  return count
}

function main() {
  const root = path.join(__dirname, '..')
  const dataDir = path.join(root, 'data')

  let total = 0
  total += checkInstructions(loadJson(path.join(dataDir, 'instruction-semantics.json')), 'instruction-semantics.json')
  total += checkPatterns(loadJson(path.join(dataDir, 'patterns.json')), 'patterns.json')
  total += checkRegisters(loadJson(path.join(dataDir, 'register-conventions.json')), 'register-conventions.json')

  const syscallDir = path.join(dataDir, 'syscalls')
  if (fs.existsSync(syscallDir)) {
    for (const f of fs.readdirSync(syscallDir)) {
      if (f.endsWith('.json')) {
        total += checkSyscalls(loadJson(path.join(syscallDir, f)), `syscalls/${f}`)
      }
    }
  }

  if (errors.length > 0) {
    console.error(`知识库验证失败（${errors.length} 个错误）:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(`知识库验证通过: 共 ${total} 个条目，0 个错误`)
}

main()
