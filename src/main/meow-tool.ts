import { spawn, ChildProcess, execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

let meowToolProcess: ChildProcess | null = null
let isShuttingDown = false

// 默认 meow-tool 服务地址
const DEFAULT_MEOW_TOOL_URL = 'http://localhost:4399'

// 本地开发模式下 meow-tool 项目路径(可通过环境变量覆盖)
const MEOW_TOOL_PATH = process.env.MEOW_TOOL_PATH || 'D:\\code\\NaCl\\meow-tool'

// 检测命令是否可用(返回 true/false)
function commandExists(cmd: string): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which'
    // execSync 默认即通过 shell 执行(Windows 下 cmd.exe,Unix 下 /bin/sh),
    // 这里无需再传 shell: true(且 ExecSyncOptions.shell 类型仅接受 string)
    execSync(`${checker} ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// 启动 meow-tool 后端子进程
export async function startMeowTool(): Promise<{ process: ChildProcess; mode: string }> {
  if (meowToolProcess) {
    return { process: meowToolProcess, mode: 'already-running' }
  }

  let command: string
  let args: string[]
  let mode: string

  // 策略 1:全局安装的 meow 命令
  if (commandExists('meow')) {
    command = 'meow'
    args = ['start']
    mode = 'global'
  }
  // 策略 2:本地开发模式(tsx 直接跑源码)
  else if (existsSync(join(MEOW_TOOL_PATH, 'src', 'bin', 'meow.ts'))) {
    command = 'node'
    args = ['--import', 'tsx', join(MEOW_TOOL_PATH, 'src', 'bin', 'meow.ts'), 'dev']
    mode = 'dev'
  }
  // 策略 3:npx 拉取
  else {
    command = 'npx'
    args = ['meow-tool', 'start']
    mode = 'npx'
  }

  console.log(`[meow-tool] 启动方式: ${mode}, 命令: ${command} ${args.join(' ')}`)

  meowToolProcess = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true, // Windows 下 meow 是 .cmd shim 需要 shell
    env: {
      ...process.env,
      PORT: '4399'
    }
  })

  // 转发子进程输出到主进程日志
  meowToolProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.log(`[meow-tool] ${text}`)
  })

  meowToolProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[meow-tool] ${text}`)
  })

  meowToolProcess.on('exit', (code, signal) => {
    if (!isShuttingDown && code !== 0) {
      console.warn(`[meow-tool] 子进程异常退出 code=${code} signal=${signal}`)
    }
    meowToolProcess = null
  })

  meowToolProcess.on('error', (err) => {
    console.error('[meow-tool] 子进程启动失败:', err)
    meowToolProcess = null
  })

  return { process: meowToolProcess, mode }
}

// 健康检查轮询(等待 meow-tool 就绪)
export async function waitForMeowTool(
  url: string = DEFAULT_MEOW_TOOL_URL,
  timeoutMs: number = 30000
): Promise<boolean> {
  const intervalMs = 500
  const maxAttempts = Math.floor(timeoutMs / intervalMs)

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/api`)
      if (response.ok) {
        console.log(`[meow-tool] 就绪 (第 ${i + 1} 次检查)`)
        return true
      }
    } catch {
      // 服务未就绪,继续等待
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  console.warn(`[meow-tool] ${timeoutMs}ms 内未就绪`)
  return false
}

// 优雅关闭 meow-tool 子进程
export async function stopMeowTool(url: string = DEFAULT_MEOW_TOOL_URL): Promise<void> {
  if (!meowToolProcess) return

  isShuttingDown = true

  // 尝试 HTTP 优雅关闭
  try {
    await fetch(`${url}/v1/shutdown`, { method: 'POST' })
    console.log('[meow-tool] 已发送 shutdown 请求')
  } catch (err) {
    console.warn('[meow-tool] shutdown 请求失败:', err)
  }

  // 等待 500ms 让其优雅退出
  await new Promise((resolve) => setTimeout(resolve, 500))

  // 强制 kill(如果还在运行)
  if (meowToolProcess) {
    try {
      meowToolProcess.kill('SIGTERM')
      // Windows 下 SIGTERM 会被转成 TerminateProcess
    } catch (err) {
      console.warn('[meow-tool] kill 失败:', err)
    }
    meowToolProcess = null
  }

  isShuttingDown = false
}
