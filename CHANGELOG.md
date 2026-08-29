# Changelog

本项目的所有显著变更将记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.0] - 2026-08-29

### Added

- LSP 双进程架构：client（VSCode 扩展宿主）+ server（独立语言服务器）
- 行级词法分析器：Token 识别、操作数解析、内存寻址、错误恢复
- 数据驱动知识库：指令语义模板（中英双语）、寄存器约定、多指令模式、系统调用表
- 注释引擎：模板匹配、条件片段、置信度、`[nasm-commenter]` 标记、去重保护
- 上下文追踪：基本块划分、寄存器常量传播、栈帧识别、系统调用参数回溯、ABI 自动检测
- 模式匹配：函数序言/结尾、strlen、write/exit 系统调用、循环等惯用模式
- LSP 能力：Hover 指令/寄存器提示、CodeAction、自定义注释请求
- 6 个命令：注释文件/选区/行/函数、移除自动注释、切换行内/上方样式
- 可选 LLM 增强：OpenAI 兼容 + Ollama 适配器，默认关闭，失败静默回退规则结果
- 三层测试：单元 / 集成（fixtures）/ 快照，Vitest 驱动
