#!/usr/bin/env node
/**
 * 以 UPDATE_SNAPSHOTS=1 重新运行快照测试，再生成 *.expected.asm。
 * 跨平台封装（避免在 npm script 中使用 Unix 环境变量语法）。
 */
'use strict'

const { spawnSync } = require('child_process')

const result = spawnSync('npx', ['vitest', 'run', 'tests/snapshot'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, UPDATE_SNAPSHOTS: '1' }
})
process.exit(result.status ?? 1)
