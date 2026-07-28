#!/usr/bin/env node
// meow-vpet CLI 入口
//
// 命令:
//   meow-vpet start              启动桌宠(后台运行)
//   meow-vpet start --foreground 前台运行(可看日志,Ctrl+C 退出)
//   meow-vpet stop               关闭运行中的桌宠
//   meow-vpet status             查看运行状态
//   meow-vpet version            查看版本
//   meow-vpet help               显示帮助
//
// 通过 PID 文件(~/.meow-vpet/meow-vpet.pid)跟踪运行中的实例

import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))

const MEOW_VPET_HOME = process.env.MEOW_VPET_HOME && process.env.MEOW_VPET_HOME.trim().length > 0
  ? process.env.MEOW_VPET_HOME
  : join(homedir(), '.meow-vpet')
const PID_FILE = join(MEOW_VPET_HOME, 'meow-vpet.pid')
const LOG_FILE = join(MEOW_VPET_HOME, 'meow-vpet.log')
const MEOW_TOOL_URL = process.env.MEOW_TOOL_URL || 'http://localhost:4399'

const args = process.argv.slice(2)
const command = args[0] || 'help'
const cmdArgs = args.slice(1)

// ─────────────────────────────────────────────────────────────
// PID 文件管理
// ─────────────────────────────────────────────────────────────

function ensureHome() {
  if (!existsSync(MEOW_VPET_HOME)) mkdirSync(MEOW_VPET_HOME, { recursive: true })
}

function readPid() {
  if (!existsSync(PID_FILE)) return null
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function writePid(pid) {
  ensureHome()
  writeFileSync(PID_FILE, String(pid), 'utf-8')
}

function clearPid() {
  if (existsSync(PID_FILE)) {
    try { unlinkSync(PID_FILE) } catch { /* ignore */ }
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0) // 信号 0 只检测,不发实际信号
    return true
  } catch {
    return false
  }
}

// 递归终止进程树(Windows 用 taskkill /T,Unix 用进程组负数 PID)
function killProcessTree(pid) {
  try {
    if (process.platform === 'win32') {
      // /T 递归终止子进程(meow-tool 子进程也会被带走),/F 强制
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true, stdio: 'ignore' })
    } else {
      // 负数 PID 表示进程组(SIGTERM 给整个组)
      try { process.kill(-pid, 'SIGTERM') } catch { process.kill(pid, 'SIGTERM') }
    }
  } catch (err) {
    // 兜底直接 kill
    try { process.kill(pid, 'SIGKILL') } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────
// meow-tool 健康检查
// ─────────────────────────────────────────────────────────────

async function checkMeowToolHealth() {
  try {
    const r = await fetch(`${MEOW_TOOL_URL}/api`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

async function shutdownMeowTool() {
  try {
    await fetch(`${MEOW_TOOL_URL}/v1/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(1500)
    })
    return true
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// 命令:version
// ─────────────────────────────────────────────────────────────

function showVersion() {
  console.log(`meow-vpet v${pkg.version}`)
}

// ─────────────────────────────────────────────────────────────
// 命令:help
// ─────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
meow-vpet v${pkg.version} - Live2D 虚拟桌宠

用法:
  meow-vpet <command> [options]

命令:
  start                启动桌宠(默认后台运行)
  stop                 关闭运行中的桌宠
  status               查看运行状态(桌宠进程 + meow-tool 后端)
  version              查看版本号
  help                 显示此帮助信息

start 选项:
  --foreground, -f     前台运行(可看日志,Ctrl+C 退出)
  --dev                启动时打开 DevTools

环境变量:
  MEOW_VPET_HOME       配置目录(默认 ~/.meow-vpet)
  MEOW_TOOL_URL        meow-tool 服务地址(默认 http://localhost:4399)
  MEOW_TOOL_PATH       本地 meow-tool 源码路径(仅开发模式)

示例:
  meow-vpet start              # 后台启动
  meow-vpet start --foreground # 前台启动(可看日志)
  meow-vpet status             # 查看状态
  meow-vpet stop               # 关闭
  meow-vpet version            # 查看版本

文件位置:
  PID 文件:  ${PID_FILE}
  日志文件:  ${LOG_FILE}
  配置目录:  ${MEOW_VPET_HOME}
`)
}

// ─────────────────────────────────────────────────────────────
// 命令:start
// ─────────────────────────────────────────────────────────────

function start() {
  // 单实例检查
  const existingPid = readPid()
  if (existingPid && isProcessAlive(existingPid)) {
    console.error(`[meow-vpet] 已有实例运行中 (PID ${existingPid})`)
    console.error('  先停止: meow-vpet stop')
    process.exit(1)
  }
  if (existingPid) clearPid() // 清理 stale PID

  // 定位 electron 可执行文件
  const require = createRequire(import.meta.url)
  let electronBin
  try {
    electronBin = require('electron')
  } catch {
    console.error('[meow-vpet] 未找到 electron 依赖,请确认已正确安装:')
    console.error('  npm install meow-vpet')
    console.error('  或全局安装: npm install -g meow-vpet')
    process.exit(1)
  }

  const mainEntry = resolve(root, 'out/main/index.js')
  if (!existsSync(mainEntry)) {
    console.error(`[meow-vpet] 构建产物不存在: ${mainEntry}`)
    console.error('  请重新安装: npm install meow-vpet')
    process.exit(1)
  }

  // 解析 start 子命令参数
  const foreground = cmdArgs.includes('--foreground') || cmdArgs.includes('-f')
  const dev = cmdArgs.includes('--dev')
  // 转发给 electron 主进程的参数
  const electronArgs = [mainEntry]
  if (dev) electronArgs.push('--dev')

  const env = { ...process.env, MEOW_VPET_NPM: '1' }

  if (foreground) {
    // 前台模式:继承 stdio,阻塞等待,日志直接输出到终端
    console.log(`[meow-vpet] 前台启动中...`)
    const child = spawn(electronBin, electronArgs, {
      stdio: 'inherit',
      env,
      shell: false
    })
    if (child.pid) {
      writePid(child.pid)
      console.log(`[meow-vpet] 已启动 (PID ${child.pid}),Ctrl+C 退出`)
    }
    child.on('exit', (code, signal) => {
      clearPid()
      if (signal) process.kill(process.pid, signal)
      else process.exit(code ?? 0)
    })
    // 转发信号给子进程
    process.on('SIGINT', () => child.kill('SIGINT'))
    process.on('SIGTERM', () => child.kill('SIGTERM'))
  } else {
    // 后台模式:stdio 重定向到日志文件,父进程立即退出
    ensureHome()
    const logFd = openSync(LOG_FILE, 'a')
    const child = spawn(electronBin, electronArgs, {
      stdio: ['ignore', logFd, logFd],
      env,
      detached: true,
      shell: false
    })
    child.unref() // 父进程不等待子进程
    if (child.pid) {
      writePid(child.pid)
      console.log(`[meow-vpet] 已后台启动 (PID ${child.pid})`)
      console.log(`  日志: ${LOG_FILE}`)
      console.log(`  停止: meow-vpet stop`)
      console.log(`  状态: meow-vpet status`)
    } else {
      console.error('[meow-vpet] 启动失败')
      process.exit(1)
    }
    process.exit(0)
  }
}

// ─────────────────────────────────────────────────────────────
// 命令:stop
// ─────────────────────────────────────────────────────────────

async function stop() {
  const pid = readPid()
  if (!pid) {
    console.error('[meow-vpet] 未找到运行中的实例(PID 文件不存在)')
    console.error('  如果桌宠确实在运行但 PID 文件丢失,请手动结束 electron 进程')
    process.exit(1)
  }
  if (!isProcessAlive(pid)) {
    console.log('[meow-vpet] 实例已不在运行,清理残留 PID 文件')
    clearPid()
    process.exit(0)
  }

  console.log(`[meow-vpet] 正在关闭实例 (PID ${pid})...`)

  // 1. 先让 meow-tool 优雅关闭(它会做 SQLite 落盘等收尾)
  const mtOk = await shutdownMeowTool()
  if (mtOk) console.log('  ✓ meow-tool 后端已优雅关闭')
  else console.log('  · meow-tool 后端未响应(可能未启动或已退出)')

  // 2. 等待 500ms 让 meow-tool 完成收尾
  await new Promise(r => setTimeout(r, 500))

  // 3. 强制终止 electron 进程树(包括其 meow-tool 子进程,如果有)
  killProcessTree(pid)

  // 4. 轮询确认进程已退出(最多 3 秒)
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) break
    await new Promise(r => setTimeout(r, 200))
  }

  clearPid()
  if (isProcessAlive(pid)) {
    console.warn('[meow-vpet] 警告:进程可能未完全退出,请手动检查任务管理器')
    process.exit(1)
  }
  console.log('[meow-vpet] 已关闭')
  process.exit(0)
}

// ─────────────────────────────────────────────────────────────
// 命令:status
// ─────────────────────────────────────────────────────────────

async function status() {
  const pid = readPid()
  const running = pid ? isProcessAlive(pid) : false

  console.log(`meow-vpet v${pkg.version}`)
  console.log('')
  console.log('桌宠进程:')
  console.log(`  PID: ${pid ?? '(无)'}`)
  console.log(`  状态: ${running ? '运行中' : '未运行'}`)
  if (pid && !running) {
    console.log('  (PID 文件残留,实例已退出)')
  }
  console.log('')
  console.log('meow-tool 后端:')
  process.stdout.write('  状态: 检查中...   \r')
  const healthy = await checkMeowToolHealth()
  console.log(`  地址: ${MEOW_TOOL_URL}`)
  console.log(`  状态: ${healthy ? '正常' : '未响应'}`)
  console.log('')
  console.log('文件位置:')
  console.log(`  PID 文件:  ${PID_FILE} ${existsSync(PID_FILE) ? '(存在)' : '(不存在)'}`)
  console.log(`  日志文件:  ${LOG_FILE} ${existsSync(LOG_FILE) ? '(存在)' : '(不存在)'}`)
  console.log(`  配置目录:  ${MEOW_VPET_HOME} ${existsSync(MEOW_VPET_HOME) ? '(存在)' : '(不存在)'}`)
  process.exit(0)
}

// ─────────────────────────────────────────────────────────────
// 命令路由
// ─────────────────────────────────────────────────────────────

switch (command) {
  case 'start':
    start()
    break
  case 'stop':
    stop()
    break
  case 'status':
    status()
    break
  case 'version':
  case '-v':
  case '--version':
  case '-version':
  case 's-v':
    showVersion()
    break
  case 'help':
  case '-h':
  case '--help':
    showHelp()
    break
  default:
    console.error(`[meow-vpet] 未知命令: ${command}\n`)
    showHelp()
    process.exit(1)
}
