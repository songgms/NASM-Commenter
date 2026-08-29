/**
 * 知识库数据加载器：启动时一次性加载全部 JSON 数据并校验。
 *
 * - 数据目录默认从 dist/src 位置向上查找（兼容 tsc 输出与测试运行）
 * - 单个文件解析失败抛 Error（含文件名与原因）；条目级校验失败跳过并 warn
 */
import * as fs from 'fs'
import * as path from 'path'
import type { ABI, KnowledgeData, SyscallTable } from '../types'
import { logger } from '../utils/logger'
import {
  validateInstructions,
  validatePatterns,
  validateRegisters,
  validateSyscalls
} from './validate'

/** 从起点向上查找包含 instruction-semantics.json 的 data 目录。 */
export function findDataDir(startDir: string = __dirname): string {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'data', 'instruction-semantics.json')
    if (fs.existsSync(candidate)) {
      return path.join(dir, 'data')
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  throw new Error(`无法定位知识库数据目录 (从 ${startDir} 向上查找失败)`)
}

function readJsonFile(filePath: string): unknown {
  const name = path.basename(filePath)
  let text: string
  try {
    text = fs.readFileSync(filePath, 'utf-8')
  } catch (e) {
    throw new Error(`读取知识库文件失败: ${name} (${String(e)})`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch (e) {
    throw new Error(`解析知识库 JSON 失败: ${name} (${String(e)})`)
  }
}

/**
 * 加载全部知识库数据。所有文件必须存在且可解析，否则抛错；
 * 条目级校验失败时跳过该条目并记录 warning（server 仍可降级启动）。
 */
export function loadKnowledge(dataDir?: string): KnowledgeData {
  const dir = dataDir ?? findDataDir()
  const issues: string[] = []

  // 指令语义表
  const { entries: instructions, issues: instrIssues } = validateInstructions(
    readJsonFile(path.join(dir, 'instruction-semantics.json')),
    'instruction-semantics.json'
  )
  for (const i of instrIssues) {
    issues.push(`instruction-semantics.json [${i.key}] ${i.message}`)
  }

  // 模式表
  const { patterns, issues: patternIssues } = validatePatterns(
    readJsonFile(path.join(dir, 'patterns.json')),
    'patterns.json'
  )
  for (const i of patternIssues) {
    issues.push(`patterns.json [${i.key}] ${i.message}`)
  }

  // 寄存器约定
  const { conventions: registers, issues: regIssues } = validateRegisters(
    readJsonFile(path.join(dir, 'register-conventions.json')),
    'register-conventions.json'
  )
  for (const i of regIssues) {
    issues.push(`register-conventions.json [${i.key}] ${i.message}`)
  }

  // 系统调用表：syscalls/ 下每个 <abi>.json 一个 ABI
  const syscalls: Partial<Record<ABI, SyscallTable>> = {}
  const syscallDir = path.join(dir, 'syscalls')
  if (fs.existsSync(syscallDir)) {
    for (const fileName of fs.readdirSync(syscallDir)) {
      if (!fileName.endsWith('.json')) {
        continue
      }
      const abi = fileName.replace(/\.json$/, '') as ABI
      const { table, issues: scIssues } = validateSyscalls(
        readJsonFile(path.join(syscallDir, fileName)),
        fileName
      )
      syscalls[abi] = table
      for (const i of scIssues) {
        issues.push(`syscalls/${fileName} [${i.key}] ${i.message}`)
      }
    }
  }

  for (const w of issues) {
    logger.warn(`知识库数据问题 (条目已跳过): ${w}`)
  }

  return { instructions, patterns, syscalls, registers }
}
