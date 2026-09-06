/**
 * handler 共享工具：模板变量构建与统一的模板→注释生成链。
 */
import type {
  ParsedLine,
  CommentConfig,
  CommentResult,
  LineContextData,
  TemplateVariables
} from '../types'
import type { KnowledgeStores } from '../knowledge'
import { operandsSignature } from '../lexer/operand-parser'
import { renderTemplate } from '../engine/template-renderer'

/** handler 统一签名：无状态，输入行 + 上下文 + 知识库 + 配置。 */
export type HandlerFunction = (
  line: ParsedLine,
  ctx: LineContextData | undefined,
  stores: KnowledgeStores,
  config: CommentConfig
) => CommentResult | null

/**
 * 从解析行构建模板变量（{dst}{src}{imm}{mem}{label}）。
 */
export function buildVars(line: ParsedLine, extra?: Partial<TemplateVariables>): TemplateVariables {
  const ops = line.operands
  const immOp = ops.find((o) => o.type === 'immediate')
  const memOp = ops.find((o) => o.type === 'memory')
  const vars: TemplateVariables = {
    dst: ops[0]?.raw,
    src: ops[1]?.raw,
    src2: ops[2]?.raw,
    imm: immOp?.raw,
    mem: memOp?.raw ?? ops.find((o) => o.raw.includes('['))?.raw,
    label: ops.find((o) => o.type === 'label')?.label
  }
  return { ...vars, ...extra }
}

/** 规则命中结果（置信度 1.0）。 */
export function ruleResult(comment: string, detail?: string, commentEn?: string): CommentResult {
  return { comment, confidence: 1.0, source: 'rule', detail, commentEn }
}

/**
 * 统一生成链：模板（精确/通配）→ description 兜底 → null（未知指令）。
 */
export function generateFromTemplate(
  mnemonic: string,
  line: ParsedLine,
  stores: KnowledgeStores,
  config: CommentConfig
): CommentResult | null {
  const entry = stores.instructions.get(mnemonic)
  if (!entry) {
    return null
  }
  const sig = operandsSignature(line.operands)
  const vars = buildVars(line)
  const template = stores.instructions.matchTemplate(mnemonic, sig, config.language)
  if (template !== undefined) {
    const rendered = renderTemplate(template, vars).trim()
    const templateEn = config.language === 'zh'
      ? stores.instructions.matchTemplate(mnemonic, sig, 'en')
      : template
    return ruleResult(rendered, entry.detail, templateEn !== undefined ? renderTemplate(templateEn, vars).trim() : undefined)
  }
  // 无匹配模板：用 description + 操作数兜底（确定性，仍属规则结果）
  const raws = line.operands.map((o) => o.raw).join(', ')
  return ruleResult(raws.length > 0 ? `${entry.description}(${raws})` : entry.description, entry.detail)
}

/** 未知指令的兜底注释（低置信度）。 */
export function unknownResult(line: ParsedLine): CommentResult {
  const raws = line.operands.map((o) => o.raw).join(', ')
  return {
    comment: raws.length > 0 ? `${line.mnemonic} ${raws}` : `${line.mnemonic}`,
    confidence: 0.3,
    source: 'fallback'
  }
}
