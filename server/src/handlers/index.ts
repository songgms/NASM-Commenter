/**
 * handler 路由：mnemonic/directive → 处理函数。
 * 指令前缀行（repne scasb）以基础指令名路由；未注册的 mnemonic 返回 null。
 */
import type { CommentConfig, ParsedLine, LineContextData, CommentResult } from '../types'
import type { KnowledgeStores } from '../knowledge'
import { handleMov, handleXchg, handlePush, handlePop, handleLea, handleMovzx, handleMovsx } from './data-transfer'
import { handleAdd, handleSub, handleInc, handleDec, handleNeg, handleCmp, handleMul, handleImul, handleDiv, handleIdiv } from './arithmetic'
import { handleAnd, handleOr, handleXor, handleNot, handleTest, handleShl, handleShr, handleSar, handleRol, handleRor } from './logic'
import {
  handleJmp, handleJe, handleJne, handleJz, handleJnz, handleJg, handleJge, handleJl, handleJle,
  handleJa, handleJae, handleJb, handleJbe, handleJs, handleJns, handleJc, handleJnc, handleJo, handleJno,
  handleCall, handleRet, handleLoop
} from './control-flow'
import { handleEnter, handleLeave } from './stack'
import { handleSyscall, handleInt, handleNop, handleHlt, handleCpuid, handleCli, handleSti } from './system'
import {
  handleMovsb, handleMovsw, handleMovsd, handleCmpsb, handleCmpsw, handleCmpsd,
  handleScasb, handleScasd, handleLodsb, handleLodsd, handleStosb, handleStosd, handleCld, handleStd
} from './string'
import {
  handleSection, handleSegment, handleGlobal, handleExtern, handleEqu, handleTimes,
  handleAlign, handleBits, handleDefault, handleDefine, handleInclude, handleMacro
} from './pseudo'
import { handleDb, handleDw, handleDd, handleDq, handleDt, handleResb, handleResw, handleResd, handleResq } from './data-define'
import { handleLabel } from './label'
import type { HandlerFunction } from './shared'

const HANDLER_MAP: Record<string, HandlerFunction> = {
  // 数据传送
  mov: handleMov, xchg: handleXchg, push: handlePush, pop: handlePop,
  lea: handleLea, movzx: handleMovzx, movsx: handleMovsx,
  // 算术
  add: handleAdd, sub: handleSub, inc: handleInc, dec: handleDec, neg: handleNeg,
  cmp: handleCmp, mul: handleMul, imul: handleImul, div: handleDiv, idiv: handleIdiv,
  // 逻辑/位运算
  and: handleAnd, or: handleOr, xor: handleXor, not: handleNot, test: handleTest,
  shl: handleShl, shr: handleShr, sar: handleSar, rol: handleRol, ror: handleRor,
  // 控制流
  jmp: handleJmp,
  je: handleJe, jne: handleJne, jz: handleJz, jnz: handleJnz,
  jg: handleJg, jge: handleJge, jl: handleJl, jle: handleJle,
  ja: handleJa, jae: handleJae, jb: handleJb, jbe: handleJbe,
  js: handleJs, jns: handleJns, jc: handleJc, jnc: handleJnc, jo: handleJo, jno: handleJno,
  call: handleCall, ret: handleRet, loop: handleLoop,
  // 栈
  enter: handleEnter, leave: handleLeave,
  // 系统
  syscall: handleSyscall, int: handleInt, nop: handleNop, hlt: handleHlt,
  cpuid: handleCpuid, cli: handleCli, sti: handleSti,
  // 字符串
  movsb: handleMovsb, movsw: handleMovsw, movsd: handleMovsd,
  cmpsb: handleCmpsb, cmpsw: handleCmpsw, cmpsd: handleCmpsd,
  scasb: handleScasb, scasd: handleScasd, lodsb: handleLodsb, lodsd: handleLodsd,
  stosb: handleStosb, stosd: handleStosd, cld: handleCld, std: handleStd,
  // 伪指令
  section: handleSection, segment: handleSegment, global: handleGlobal, extern: handleExtern,
  equ: handleEqu, times: handleTimes, align: handleAlign, bits: handleBits, default: handleDefault,
  '%define': handleDefine, '%include': handleInclude, '%macro': handleMacro,
  // 数据定义
  db: handleDb, dw: handleDw, dd: handleDd, dq: handleDq, dt: handleDt,
  resb: handleResb, resw: handleResw, resd: handleResd, resq: handleResq
}

/** 查找 handler：先查全名（含 % 前缀），再查基础指令名。 */
export function getHandler(name: string): HandlerFunction | null {
  const key = name.toLowerCase()
  return HANDLER_MAP[key] ?? null
}

/** 全部已支持的 mnemonic/directive。 */
export function listSupportedMnemonics(): string[] {
  return Object.keys(HANDLER_MAP)
}

/** 处理标签行（供引擎直接调用）。 */
export function annotateLabelLine(
  line: ParsedLine,
  ctx: LineContextData | undefined,
  _stores: KnowledgeStores,
  _config: CommentConfig
): CommentResult | null {
  return handleLabel(line, ctx, _stores, _config)
}
