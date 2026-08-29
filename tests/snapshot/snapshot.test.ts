/**
 * 快照测试：典型示例的完整注释输出与已提交的 *.expected.asm 版本化对比。
 * 有意变更注释逻辑时运行 `npm run test:snapshot:update` 重新生成。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { annotateSource, buildEdits } from '../../server/src/engine/comment-engine'
import { applyEditsToText, getStores, testConfig } from '../helpers'

const FIXTURE_DIR = path.join(__dirname, '..', 'integration', 'fixtures')
const SNAPSHOTS = ['hello-world', 'function-call', 'loop', 'syscall', 'mixed'] as const
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1'

describe('snapshot: annotated fixtures', () => {
  const stores = getStores()
  const config = testConfig()

  for (const name of SNAPSHOTS) {
    it(`${name}.expected.asm`, () => {
      const source = fs.readFileSync(path.join(FIXTURE_DIR, `${name}.asm`), 'utf-8')
      const ann = annotateSource(source, stores, config)
      const actual = applyEditsToText(source, buildEdits(ann.lines, ann.comments, config))
      const expectedPath = path.join(FIXTURE_DIR, `${name}.expected.asm`)
      if (UPDATE) {
        fs.writeFileSync(expectedPath, actual, 'utf-8')
        expect(actual).toBe(actual)
        return
      }
      expect(fs.readFileSync(expectedPath, 'utf-8')).toBe(actual)
    })
  }

  it('全部快照文件存在', () => {
    for (const name of SNAPSHOTS) {
      expect(fs.existsSync(path.join(FIXTURE_DIR, `${name}.expected.asm`))).toBe(true)
    }
  })
})
