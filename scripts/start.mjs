#!/usr/bin/env node
// meow-vpet CLI 启动器(npm 全局安装后通过 meow-vpet 命令启动)
//
// 做的事:
//   1. 定位 electron 可执行文件(从 dependencies 中的 electron 包)
//   2. 用 electron 启动构建产物 out/main/index.js
//   3. 转发 stdio + 退出码
//
// 用法:
//   meow-vpet              # 启动桌宠
//   meow-vpet --dev        # 开发模式(打开 devtools)

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// 构建产物入口
const mainEntry = resolve(root, 'out/main/index.js')

// 通过 createRequire 拿到 electron 包导出的可执行文件路径
// electron 包的 main 字段指向一个 .js 文件,该文件导出 electron 二进制路径
const require = createRequire(import.meta.url)
let electronBin
try {
  electronBin = require('electron')
} catch (err) {
  console.error('[meow-vpet] 未找到 electron 依赖,请确认已正确安装:')
  console.error('  npm install meow-vpet')
  console.error('  或全局安装: npm install -g meow-vpet')
  process.exit(1)
}

// 转发命令行参数(如 --dev)
const extraArgs = process.argv.slice(2)

const child = spawn(electronBin, [mainEntry, ...extraArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    // 标记为 npm 包运行模式(非 electron-builder 打包)
    MEOW_VPET_NPM: '1'
  }
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 0)
  }
})
