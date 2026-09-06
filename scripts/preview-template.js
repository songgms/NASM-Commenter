#!/usr/bin/env node
/**
 * 知识库注释效果预览（CLI）：
 *   node scripts/preview-template.js "mov eax, 123"
 *   node scripts/preview-template.js "add rax, rbx" --en
 *   node scripts/preview-template.js --file path/to.asm
 * 复用与扩展运行时完全相同的引擎，供贡献者验证新模板的实际输出。
 */
'use strict'

const path = require('path')

const distEngine = path.join(__dirname, '..', 'dist', 'server', 'engine', 'comment-engine.js')
const distKnowledge = path.join(__dirname, '..', 'dist', 'server', 'knowledge', 'index.js')
const distDefaults = path.join(__dirname, '..', 'dist', 'server', 'utils', 'config-defaults.js')

let engine
try {
  engine = require(distEngine)
  require(distKnowledge)
  require(distDefaults)
} catch (e) {
  console.error('未找到构建产物，请先执行: npm run build')
  process.exit(1)
}

const { annotateSource } = engine
const { loadKnowledge, buildStores } = require(distKnowledge)
const { resolveConfig } = require(distDefaults)

const args = process.argv.slice(2).filter((a) => a !== '--en')
const language = process.argv.includes('--en') ? 'en' : 'zh'

const stores = buildStores(loadKnowledge())
const config = resolveConfig({ language })

const input = args.join(' ')
if (input.trim().length === 0) {
  console.log('用法: node scripts/preview-template.js "<一行 NASM 代码>" [--en]')
  console.log('示例: node scripts/preview-template.js "mov rax, 1"')
  process.exit(0)
}

const ann = annotateSource(input, stores, config)
if (ann.comments.size === 0) {
  console.log('(该输入没有可注释内容)')
  process.exit(0)
}
for (const [lineNumber, result] of ann.comments) {
  const tag = result.skipped ? '[跳过] ' : ''
  console.log(`${String(lineNumber + 1).padStart(3)} | ${tag}${result.comment}  <${result.source}, 置信度 ${result.confidence}>`)
}
