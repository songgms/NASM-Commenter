/**
 * 注释引擎：核心编排层。
 *
 * 分层：模板/Handler（确定性规则）→ 模式（多指令惯用法）→ LLM（可选增强）。
 * 单行与文档两条路径；置信度：规则/模式/上下文固定 1.0，未知指令 fallback 0.3。
 */
import type {
  ParsedLine,
  CommentConfig,
  CommentResult,
  CommentStats,
  CommentSource,
  LineContextData,
  AnnotatedEdit,
  FormatOptions,
  ABI,
  FunctionInfo
} from '../types'
import type { KnowledgeStores } from '../knowledge'
import type { MatchedPattern } from '../knowledge/pattern-store'
import { resolveMnemonicKey } from '../knowledge/instruction-store'
import type { MacroDef, PreprocessIssue } from '../lexer/preprocessor'
import { analyzePreprocessor } from '../lexer/preprocessor'
import { parseDocument } from '../lexer/line-parser'
import { detectABI } from '../utils/abi-detector'
import { DocumentContext } from '../context/document-context'
import { matchPatterns } from '../context/pattern-matcher'
import { getHandler, annotateLabelLine } from '../handlers'
import { generateFromTemplate, unknownResult, buildVars } from '../handlers/shared'
import { renderTemplate } from './template-renderer'
import { formatComment, toEdit, alignColumn } from './comment-formatter'
import { shouldSkip } from './deduplicator'
import { hasExistingComment } from '../utils/indent'
import type { LLMAdapter, LLMRequest } from '../llm/adapter'

/** 文档注释结果。 */
export interface AnnotationOutput {
  comments: Map<number, CommentResult>
  stats: CommentStats
}

/** 由配置构造格式化选项。 */
export function formatOptionsOf(config: CommentConfig): FormatOptions {
  return {
    style: config.style,
    language: config.language,
    minColumn: config.minColumn,
    tabSize: 4,
    marker: config.marker,
    semicolon: config.semicolonStyle,
    verbose: config.verbose
  }
}

/** 模式命中的注释渲染（按行在模式中的位置取模板）。 */
function patternResult(match: MatchedPattern, line: ParsedLine, config: CommentConfig): CommentResult | null {
  const idx = match.lines.findIndex((l) => l.lineNumber === line.lineNumber)
  if (idx < 0) {
    return null
  }
  const template = config.language === 'en'
    ? match.pattern.comments_en[idx] ?? match.pattern.comments[idx]
    : match.pattern.comments[idx]
  const comment = renderTemplate(template, buildVars(line)).trim()
  return { comment, confidence: 1.0, source: 'pattern' }
}

export class CommentEngine {
  constructor(
    private readonly stores: KnowledgeStores,
    private readonly llm?: LLMAdapter,
    private readonly macros?: Map<string, MacroDef>
  ) {}

  /**
   * 单行注释生成（同步、纯规则路径）。
   * 返回 null 表示该行无需注释（空行/纯注释/未识别指令等由调用方决定兜底）。
   */
  annotateLine(line: ParsedLine, ctx: LineContextData | undefined, config: CommentConfig): CommentResult | null {
    if (line.kind === 'empty' || line.kind === 'comment-only') {
      return null
    }
    let result: CommentResult | null
    switch (line.kind) {
      case 'label':
        result = annotateLabelLine(line, ctx, this.stores, config)
        break
      case 'directive': {
        const handler = line.directive !== undefined ? getHandler(line.directive) : null
        result = handler !== null ? handler(line, ctx, this.stores, config) : null
        break
      }
      case 'instruction': {
        const key = line.mnemonic !== undefined ? resolveMnemonicKey(line.mnemonic, line.operands) : undefined
        const handler = key !== undefined ? getHandler(key) : null
        result = handler !== null
          ? handler(line, ctx, this.stores, config)
          : (key !== undefined
            ? generateFromTemplate(key, line, this.stores, config) ?? this.macroCallResult(line) ?? unknownResult(line)
            : null)
        break
      }
      default:
        return null
    }
    return this.finalize(line, result, config)
  }

  /** 宏调用注释：未收录但命中已定义宏的助记符。 */
  private macroCallResult(line: ParsedLine): CommentResult | null {
    if (line.mnemonic === undefined || this.macros === undefined) {
      return null
    }
    const macro = this.macros.get(line.mnemonic)
    if (macro === undefined) {
      return null
    }
    const raws = line.operands.map((o) => o.raw).join(', ')
    return {
      comment: `调用宏 ${macro.name}(${raws})`,
      confidence: 0.8,
      source: 'rule',
      detail: macro.nested ? '复杂宏, 语义解析受限' : `宏体 ${macro.body.length} 行, 参数 ${macro.argCount} 个`
    }
  }

  /**
   * 后置过滤：去重 → 保护语义（0.7.0 起）。
   * - 内容与已写入注释一致（或已追加）→ 跳过（幂等）
   * - protect=true：手写注释行仍生成，格式化为 `手写 / 自动` 追加（不破坏手写内容）
   * - protect=false：已有注释的行整体跳过
   */
  private finalize(line: ParsedLine, result: CommentResult | null, config: CommentConfig): CommentResult | null {
    if (result === null || result.skipped === true) {
      return result
    }
    if (shouldSkip(line.raw, result.comment, config.marker)) {
      return { ...result, skipped: true, skipReason: '注释未变化' }
    }
    if (!config.protectExistingComments && hasExistingComment(line.raw)) {
      return { comment: '', confidence: 0, source: 'rule', skipped: true, skipReason: '已有注释' }
    }
    return result
  }

  /**
   * 文档级注释生成：模式优先，逐行回退单行流程，最后统一去重与统计。
   */
  annotateDocument(
    lines: ParsedLine[],
    contexts: Map<number, LineContextData>,
    matches: MatchedPattern[],
    config: CommentConfig
  ): AnnotationOutput {
    const comments = new Map<number, CommentResult>()
    const patternByLine = new Map<number, { match: MatchedPattern; index: number }>()
    for (const match of matches) {
      match.lines.forEach((l, index) => {
        if (!patternByLine.has(l.lineNumber)) {
          patternByLine.set(l.lineNumber, { match, index })
        }
      })
    }

    for (const line of lines) {
      const ctx = contexts.get(line.lineNumber)
      const hit = patternByLine.get(line.lineNumber)
      let result: CommentResult | null
      if (hit !== undefined) {
        result = patternResult(hit.match, line, config)
        result = this.finalize(line, result, config)
      } else {
        result = this.annotateLine(line, ctx, config)
      }
      if (result !== null) {
        comments.set(line.lineNumber, result)
      }
    }

    return { comments, stats: this.buildStats(lines, comments) }
  }

  private buildStats(lines: ParsedLine[], comments: Map<number, CommentResult>): CommentStats {
    const bySource: Record<CommentSource, number> = {
      rule: 0, pattern: 0, context: 0, llm: 0, fallback: 0
    }
    let commented = 0
    let skipped = 0
    for (const result of comments.values()) {
      if (result.skipped === true) {
        skipped++
        continue
      }
      commented++
      bySource[result.source]++
    }
    return {
      totalLines: lines.length,
      commentedLines: commented,
      skippedLines: skipped,
      bySource
    }
  }

  /** LLM 适配器（可选）。 */
  getLLM(): LLMAdapter | undefined {
    return this.llm
  }
}

/** 覆盖行数：非跳过结果 + 「注释未变化」（已在文件中的匹配注释）。 */
export function countCoveredLines(comments: Map<number, CommentResult>): number {
  let covered = 0
  for (const result of comments.values()) {
    if (result.skipped !== true || result.skipReason === '注释未变化') {
      covered++
    }
  }
  return covered
}

/**
 * 将注释结果转为编辑列表（含范围对齐）。
 */
export function buildEdits(
  lines: ParsedLine[],
  comments: Map<number, CommentResult>,
  config: CommentConfig
): AnnotatedEdit[] {
  const edits: AnnotatedEdit[] = []
  const options = formatOptionsOf(config)
  const considered = lines.filter((l) => {
    const r = comments.get(l.lineNumber)
    return r !== undefined && r.skipped !== true && l.kind !== 'empty' && l.kind !== 'comment-only'
  })
  const align = alignColumn(considered.map((l) => l.raw), config.minColumn)
  for (const line of considered) {
    const result = comments.get(line.lineNumber)
    if (result === undefined) {
      continue
    }
    const formatted = formatComment(line, result, options, line.comment !== undefined ? undefined : align)
    edits.push(toEdit(formatted))
  }
  return edits
}

/** annotateSource 的完整输出。 */
export interface SourceAnnotation {
  lines: ParsedLine[]
  abi: ABI
  comments: Map<number, CommentResult>
  stats: CommentStats
  /** 文档上下文（函数注释等后续使用） */
  context: DocumentContext
  matches: MatchedPattern[]
  /** 预处理分析：不平衡/复杂宏诊断、条件块行、include 列表 */
  preprocess: {
    issues: PreprocessIssue[]
    conditionalLines: Set<number>
    includes: string[]
    macros: Map<string, MacroDef>
  }
}

/**
 * 端到端管线：解析 → ABI 检测 → 上下文追踪 → 模式匹配 → 注释生成。
 * @param range 仅注释该行范围（0-based inclusive）；缺省为全文
 */
export function annotateSource(
  text: string,
  stores: KnowledgeStores,
  config: CommentConfig,
  range?: { startLine: number; endLine: number }
): SourceAnnotation {
  const lines = parseDocument(text)
  const abi = config.abi === 'auto' ? detectABI(lines) : config.abi
  const context = new DocumentContext(lines, abi, stores.syscalls)
  const contexts = context.buildLineContexts()
  const matches = matchPatterns(lines, stores)
  const analysis = analyzePreprocessor(text)

  const engine = new CommentEngine(stores, undefined, analysis.macros)
  let target = lines
  if (range !== undefined) {
    target = lines.filter((l) => l.lineNumber >= range.startLine && l.lineNumber <= range.endLine)
  }
  const { comments, stats } = engine.annotateDocument(target, contexts, matches, config)
  return {
    lines,
    abi,
    comments,
    stats,
    context,
    matches,
    preprocess: {
      issues: analysis.issues,
      conditionalLines: analysis.conditionalLines,
      includes: analysis.includes,
      macros: analysis.macros
    }
  }
}

/** LLM 增强判定：规则兜底注释（低置信度）或完全未注释的可注释行。 */
function needsLLM(line: ParsedLine, existing: CommentResult | undefined): boolean {
  if (line.kind !== 'instruction' || line.mnemonic === undefined) {
    return false
  }
  if (existing === undefined) {
    return true
  }
  return existing.source === 'fallback' && existing.skipped !== true
}

/** 提取前后各 5 行代码上下文。 */
function codeContext(rawLines: string[], line: number): string {
  const from = Math.max(0, line - 5)
  const to = Math.min(rawLines.length, line + 6)
  return rawLines.slice(from, to).join('\n')
}

/**
 * 带可选 LLM 增强的管线：在纯规则结果之上，对规则无法注释（fallback）或
 * 遗漏的指令行调用 LLM；任何失败都静默保留规则结果。
 */
export async function annotateSourceEnhanced(
  text: string,
  stores: KnowledgeStores,
  config: CommentConfig,
  llm?: LLMAdapter,
  range?: { startLine: number; endLine: number }
): Promise<SourceAnnotation> {
  const base = annotateSource(text, stores, config, range)
  if (llm === undefined || !config.llm.enabled) {
    return base
  }
  const rawLines = text.split(/\r?\n/)
  let target = base.lines
  if (range !== undefined) {
    target = base.lines.filter((l) => l.lineNumber >= range.startLine && l.lineNumber <= range.endLine)
  }
  for (const line of target) {
    const existing = base.comments.get(line.lineNumber)
    if (!needsLLM(line, existing)) {
      continue
    }
    const request: LLMRequest = {
      instruction: line.mnemonic!,
      operands: line.operands.map((o) => o.raw),
      context: codeContext(rawLines, line.lineNumber),
      abi: base.abi,
      language: config.language
    }
    try {
      const response = await llm.generate(request)
      if (response.comment.length > 0) {
        if (existing !== undefined && existing.source === 'fallback') {
          base.stats.bySource.fallback--
        }
        base.comments.set(line.lineNumber, {
          comment: response.comment,
          confidence: response.confidence,
          source: 'llm'
        })
        base.stats.bySource.llm++
      }
    } catch {
      // 静默回退：保留规则结果
    }
  }
  return base
}

/** 函数块注释生成结果。 */
export interface FunctionComment {
  fn: FunctionInfo
  /** 块注释各（不含分号前缀） */
  blockCommentLines: string[]
  /** 上方插入编辑 */
  edit: AnnotatedEdit
  confidence: number
}

/**
 * 为光标所在（或上方最近的）函数生成块注释：
 * 函数名 / 功能（依据命中的模式）/ 参数 / 返回值 / 破坏的寄存器。
 */
export function buildFunctionComment(
  annotation: SourceAnnotation,
  lineNumber: number,
  config: CommentConfig
): FunctionComment | null {
  const { context, lines } = annotation
  const fn =
    context.getFunctionAt(lineNumber) ??
    context
      .getFunctions()
      .filter((f) => f.startLine < lineNumber)
      .pop()
  if (fn === undefined) {
    return null
  }
  const startLine = lines[fn.startLine]
  if (startLine === undefined) {
    return null
  }
  if (config.protectExistingComments && hasExistingComment(startLine.raw)) {
    return null
  }

  // 功能：函数体内命中的模式名（去重）
  const patternNames: string[] = []
  for (const match of annotation.matches) {
    if (match.startLine >= fn.startLine && match.endLine <= fn.endLine) {
      if (!patternNames.includes(match.pattern.name)) {
        patternNames.push(match.pattern.name)
      }
    }
  }
  const purpose = patternNames.length > 0 ? patternNames.join('；') : '见各行注释'

  // 返回值：最后一条 ret 前的 rax 状态
  let retLine: number | undefined
  for (let ln = fn.endLine; ln >= fn.startLine; ln--) {
    if (lines[ln]?.kind === 'instruction' && lines[ln].mnemonic === 'ret') {
      retLine = ln
      break
    }
  }
  let returnValue = '无显式返回值'
  if (retLine !== undefined) {
    const returnRegister = annotation.abi === 'linux-x86' ? 'eax' : 'rax'
    const state = context.getRegisterValue(returnRegister, retLine)
    if (state !== null) {
      returnValue = `${returnRegister} = ${state}`
    }
  }

  // 破坏的寄存器：函数体内作为目标操作数被写入的寄存器
  const clobbered: string[] = []
  for (let ln = fn.startLine; ln <= fn.endLine; ln++) {
    const l = lines[ln]
    if (l?.kind !== 'instruction') {
      continue
    }
    const dst = l.operands[0]
    if (dst?.type === 'register') {
      const reg = dst.register ?? dst.raw.toLowerCase()
      if (reg !== 'rsp' && reg !== 'rbp' && reg !== 'esp' && reg !== 'ebp' && !clobbered.includes(reg)) {
        clobbered.push(reg)
      }
    }
  }

  const args = fn.parameterRegisters.length > 0 ? fn.parameterRegisters.join(', ') : '无'
  const clobberedText = clobbered.length > 0 ? clobbered.join(', ') : '无'
  // 模板渲染：占位符 {name} {purpose} {args} {return} {clobbered}，多行用 \n 分隔
  const template = config.functionTemplate.trim().length > 0
    ? config.functionTemplate
    : '函数名: {name}\n功能: {purpose}\n参数: {args}\n返回: {return}\n破坏的寄存器: {clobbered}'
  const blockCommentLines = template.split('\\n').join('\n').split('\n').map((l) =>
    l
      .replace('{name}', fn.name)
      .replace('{purpose}', purpose)
      .replace('{args}', args)
      .replace('{return}', returnValue)
      .replace('{clobbered}', clobberedText)
  )
  const indent = startLine.indent ?? ''
  const text = blockCommentLines.map((l) => `${indent}; ${l}`).join('\n') + '\n'
  return {
    fn,
    blockCommentLines,
    edit: {
      startLine: fn.startLine,
      startCharacter: 0,
      endLine: fn.startLine,
      endCharacter: 0,
      newText: text
    },
    confidence: patternNames.length > 0 ? 0.9 : 0.6
  }
}
