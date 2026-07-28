// npm 包安装后自动执行:在用户主目录下创建 ~/.meow-vpet 目录
//
// 设计:
//   - 跨平台:用 os.homedir() 而不是硬编码 C:\
//   - 幂等:目录已存在不报错
//   - 静默失败:不阻塞 npm install(只在控制台输出提示)
//   - 不依赖项目代码:用纯 ESM .mjs,不 import ts 源码

import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

const MEOW_VPET_HOME = process.env.MEOW_VPET_HOME && process.env.MEOW_VPET_HOME.trim().length > 0
  ? process.env.MEOW_VPET_HOME
  : join(homedir(), '.meow-vpet')

try {
  if (!existsSync(MEOW_VPET_HOME)) {
    mkdirSync(MEOW_VPET_HOME, { recursive: true })
    console.log(`[meow-vpet] created home directory: ${MEOW_VPET_HOME}`)
  } else {
    // 已存在(可能是升级安装),静默
    console.log(`[meow-vpet] home directory ready: ${MEOW_VPET_HOME}`)
  }
} catch (err) {
  // 不阻塞安装,只警告
  console.warn(`[meow-vpet] warning: failed to create ${MEOW_VPET_HOME}: ${err instanceof Error ? err.message : err}`)
  console.warn('[meow-vpet] the directory will be created on first run via getConfigDir()')
}
