# 贡献指南

感谢关注 NASM Commenter！请先阅读 [docs/00-index.md](./docs/00-index.md) 了解项目全貌。

## 开发环境

```bash
git clone <fork> nasm-commenter && cd nasm-commenter
npm install
npm run build
npm test
```

要求：Node ≥ 18、npm ≥ 9、VSCode（调试用）。

## 提交前检查清单

每次提交前必须全部通过：

- `npm run lint` 无错误
- `npm run build`（含类型检查）无错误
- `node scripts/validate-schema.js` 通过
- `npm test` 全部通过
- 新增代码有对应测试；公共 API 有 JSDoc
- 没有 `any` 类型；server 端没有 `console.log`（用 logger 输出到 stderr）
- 没有硬编码的指令语义（一律放 `data/` 知识库）
- 自动生成的注释包含 `[nasm-commenter]` 标记

硬性约束见 [docs/07-ai-development-guide.md](./docs/07-ai-development-guide.md) §1。

## 贡献知识库数据（最简单的贡献方式，无需会写代码）

1. 编辑 `data/instruction-semantics.json`，按 `schemas/instruction-schema.json` 添加条目
   （必填 summary / description / category / flags_affected / templates，模板 key 为操作数签名）
2. 运行 `node scripts/validate-schema.js` 验证
3. 在 `tests/` 添加对应 fixture 或用例
4. 提交 PR

新增系统调用请同时更新 `data/syscalls/linux-x64.json` 与 `linux-x86.json`（如适用）；
新增惯用模式请编辑 `data/patterns.json`。

## 提交规范

- 分支：从 `main` 拉出特性分支，PR 回 `main`
- 提交信息：`feat: xxx` / `fix: xxx` / `docs: xxx` / `data: xxx` / `test: xxx`
- 版本：遵循 SemVer，MAJOR=不兼容架构变更，MINOR=新功能，PATCH=修复与知识库扩充
