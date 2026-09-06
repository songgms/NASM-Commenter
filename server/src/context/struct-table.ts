/**
 * NASM struc/endstruc 结构体解析：字段偏移表、字段引用翻译。
 *
 * NASM 结构体用法：
 *   struc MyStruct
 *     .field1:  resd 1
 *     .field2:  resb 10
 *   endstruc
 * 字段引用：`MyStruct.field1`（作为立即数/位移符号）。
 */
import type { ParsedLine, StructDef, StructField } from '../types'

const RES_SIZES: Record<string, number> = { resb: 1, resw: 2, resd: 4, resq: 8 }

/** 解析文档中的全部结构体定义（key 为结构体名小写）。 */
export function parseStructs(lines: ParsedLine[]): Map<string, StructDef> {
  const structs = new Map<string, StructDef>()
  let current: { name: string; fields: StructField[]; offset: number } | null = null

  for (const line of lines) {
    if (line.kind === 'directive' && line.directive === 'struc' && line.directiveArgs?.[0]) {
      if (current !== null) {
        // 未闭合的 struc：按已有字段收尾
        structs.set(current.name.toLowerCase(), {
          name: current.name,
          fields: current.fields,
          size: current.offset
        })
      }
      current = { name: line.directiveArgs[0], fields: [], offset: 0 }
      continue
    }
    if (line.kind === 'directive' && line.directive === 'endstruc') {
      if (current !== null) {
        structs.set(current.name.toLowerCase(), {
          name: current.name,
          fields: current.fields,
          size: current.offset
        })
        current = null
      }
      continue
    }
    if (current !== null && line.kind === 'directive' && line.directive !== undefined && line.label !== undefined) {
      const unitSize = RES_SIZES[line.directive]
      if (unitSize === undefined) {
        continue
      }
      const argStr = line.directiveArgs?.[0] ?? ''
      const count = /^\d+$/.test(argStr) ? parseInt(argStr, 10) : 1
      const fieldName = line.label.startsWith('.') ? line.label.slice(1) : line.label
      current.fields.push({ name: fieldName, offset: current.offset, size: unitSize * count })
      current.offset += unitSize * count
    }
  }
  return structs
}

/** 结构体字段引用查找结果。 */
export interface StructFieldRef {
  struct: StructDef
  field: StructField
  /** 引用原文（如 MyStruct.field1） */
  ref: string
}

/**
 * 在文本（位移表达式/标识符 token）中查找结构体字段引用。
 * 匹配形如 `Struct.field` 的片段，返回第一个命中项。
 */
export function findStructFieldRef(
  structs: Map<string, StructDef>,
  text: string
): StructFieldRef | null {
  const refRe = /([A-Za-z_][\w$]*)\.([A-Za-z_][\w$]*)/g
  for (const match of text.matchAll(refRe)) {
    const struct = structs.get(match[1].toLowerCase())
    if (struct === undefined) {
      continue
    }
    const field = struct.fields.find((f) => f.name === match[2])
    if (field !== undefined) {
      return { struct, field, ref: match[0] }
    }
  }
  return null
}
