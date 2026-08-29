/**
 * FNV-1a 字符串哈希（零外部依赖），用于 LLM 结果缓存键。
 */

/**
 * 计算 32 位 FNV-1a 哈希，返回 8 位十六进制字符串。
 */
export function hashString(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  // 转为无符号 32 位并输出十六进制
  return (hash >>> 0).toString(16).padStart(8, '0')
}
