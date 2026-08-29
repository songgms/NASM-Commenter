/**
 * 分级日志工具。
 *
 * 关键约束：LSP 服务器 stdout 是 JSON-RPC 协议通道，所有日志必须输出到
 * stderr（process.stderr.write），禁止使用 console.log。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 日志接口。 */
export interface Logger {
  debug(msg: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

function formatTimestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/**
 * 创建分级 Logger。低于设定级别的日志不输出，默认级别 warn。
 */
export function createLogger(level: LogLevel = 'warn'): Logger {
  function write(lvl: LogLevel, msg: string, args: unknown[]): void {
    if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level]) {
      return
    }
    const rest = args.map((a) => String(a)).join(' ')
    const line = `[${formatTimestamp()}] [${lvl.toUpperCase()}] ${[msg, rest].filter(Boolean).join(' ')}\n`
    process.stderr.write(line)
  }

  return {
    debug: (msg, ...args) => write('debug', msg, args),
    info: (msg, ...args) => write('info', msg, args),
    warn: (msg, ...args) => write('warn', msg, args),
    error: (msg, ...args) => write('error', msg, args)
  }
}

/** 全局默认 logger（server 各模块共享）。 */
export const logger = createLogger('warn')
