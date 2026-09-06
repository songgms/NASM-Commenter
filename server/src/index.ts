#!/usr/bin/env node
/**
 * 独立语言服务器入口（也可作为 npm bin：nasm-commenter-server --stdio）。
 */
import { NASMLanguageServer } from './server'

new NASMLanguageServer().start()
