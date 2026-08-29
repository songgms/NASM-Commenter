/**
 * 函数追踪器：识别函数边界与参数使用。
 *
 * 函数入口：global 导出的标签、`_start`、section .text 后的第一个标签。
 * 函数结束：下一个函数入口前，或函数体内最后一个 ret/leave 之后。
 */
import type { ABI, FunctionInfo, ParsedLine } from '../types'
import { registersReadIn } from './register-usage'

export interface FunctionMap {
  functions: FunctionInfo[]
  /** 行号 → 所在函数 */
  byLine: Map<number, FunctionInfo>
}

/** 收集 global 导出的符号名。 */
function collectGlobals(lines: ParsedLine[]): Set<string> {
  const globals = new Set<string>()
  for (const line of lines) {
    if (line.kind === 'directive' && (line.directive === 'global') && line.directiveArgs?.[0]) {
      globals.add(line.directiveArgs[0])
    }
  }
  return globals
}

export function trackFunctions(lines: ParsedLine[], abi: ABI): FunctionMap {
  const globals = collectGlobals(lines)
  const labelLines = lines.filter((l) => l.kind === 'label' && l.label !== undefined)

  const starts: ParsedLine[] = []
  for (const line of labelLines) {
    const name = line.label!
    if (globals.has(name) || name === '_start') {
      starts.push(line)
    }
  }
  // 没有任何 global 时，取第一个标签作为入口（_start 常无 global）
  if (starts.length === 0 && labelLines.length > 0) {
    starts.push(labelLines[0])
  }

  const functions: FunctionInfo[] = []
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]
    const nextStart = i + 1 < starts.length ? starts[i + 1].lineNumber : lines.length
    // 结束：下一个函数入口前最后一个 ret/leave 行；否则下一入口前一行
    let end = nextStart - 1
    for (let ln = start.lineNumber; ln < nextStart; ln++) {
      const l = lines[ln]
      if (l?.kind === 'instruction' && (l.mnemonic === 'ret' || l.mnemonic === 'leave')) {
        end = Math.max(end, ln)
        if (l.mnemonic === 'ret') {
          break
        }
      }
    }
    const body = lines.slice(start.lineNumber, end + 1)
    functions.push({
      name: start.label!,
      startLine: start.lineNumber,
      endLine: end,
      parameterRegisters: [...registersReadIn(body, abi)]
    })
  }

  const byLine = new Map<number, FunctionInfo>()
  for (const fn of functions) {
    for (let ln = fn.startLine; ln <= fn.endLine; ln++) {
      if (!byLine.has(ln)) {
        byLine.set(ln, fn)
      }
    }
  }
  return { functions, byLine }
}
