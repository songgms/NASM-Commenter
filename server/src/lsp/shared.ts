/**
 * LSP 模块共享常量。
 */

/** 携带跳转目标语义的助记符（补全标签优先 / 诊断跳转目标校验共用）。 */
export const JUMP_MNEMONICS = new Set([
  'jmp', 'call', 'loop',
  'je', 'jne', 'jz', 'jnz', 'jg', 'jge', 'jl', 'jle', 'ja', 'jae', 'jb', 'jbe',
  'js', 'jns', 'jc', 'jnc', 'jo', 'jno'
])
