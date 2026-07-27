import { z } from 'zod'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// 配置 schema(zod 校验)
const configSchema = z.object({
  meowToolUrl: z.string().default('http://localhost:4399'),
  // 模型路径:相对 ~/.meow-vpet/ 的路径,例如 "models/Mao/Mao.model3.json"
  // 渲染层加载时通过 IPC models:resolve-url 转为 file:// URL
  live2dModelPath: z.string().default('models/Mao/Mao.model3.json'),
  agentId: z.string().optional(),
  // 系统提示词(每次对话会作为 system 消息 prepend 到 messages 数组开头)
  systemPrompt: z.string().optional(),
  windowX: z.number().optional(),
  windowY: z.number().optional(),
  // 窗口尺寸缩放系数(基于 360x480 的乘数,1.0 = 默认尺寸)
  // 设置页实时调节时会通过 IPC 通知主进程 setSize
  // 最小 0.8(80% = 288x384 px),过小会导致 Live2D 模型细节不可辨识
  windowSizeScale: z.number().min(0.8).max(2.0).default(1.0),
  // 模型尺寸缩放系数(基于 fitScale 的乘数,1.0 = 自适应铺满窗口 80%)
  // 渲染层 Live2DCanvas watch 此值变化后即时重应用 scale
  modelScale: z.number().min(0.3).max(2.0).default(1.0)
})

// 旧配置迁移:将 /models/... 形式的绝对路径转为 models/... 相对路径
// 旧版本(<=0.1.0)使用 /models/... 从 dev server 或 extraResources 根加载,
// 新版本统一从 ~/.meow-vpet/ 加载,需要去掉前导斜杠
function migrateConfig(raw: Record<string, unknown>): Record<string, unknown> {
  if (typeof raw.live2dModelPath === 'string' && raw.live2dModelPath.startsWith('/models/')) {
    raw.live2dModelPath = raw.live2dModelPath.slice(1)
  }
  return raw
}

// 配置类型
export type MeowVpetConfig = z.infer<typeof configSchema>

// 获取配置目录(不存在则创建)
export function getConfigDir(): string {
  const dir = join(homedir(), '.meow-vpet')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

// 获取配置文件完整路径
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

// 加载配置(文件不存在或校验失败返回默认值)
export function loadConfig(): MeowVpetConfig {
  const path = getConfigPath()
  if (!existsSync(path)) {
    return configSchema.parse({})
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw)
    // 旧配置迁移:/models/... → models/...
    const migrated = migrateConfig(parsed)
    return configSchema.parse(migrated)
  } catch (err) {
    console.warn('[meow-vpet] 配置文件解析失败,使用默认值:', err)
    return configSchema.parse({})
  }
}

// 合并保存配置(读旧值 → 合并 → 校验 → 写文件)
// 写入失败时仅打印警告,不抛出异常,避免拖拽期间频繁保存导致 EPERM 崩溃主进程
export function saveConfig(partial: Partial<MeowVpetConfig>): MeowVpetConfig {
  const current = loadConfig()
  const merged = { ...current, ...partial }
  const validated = configSchema.parse(merged)
  try {
    writeFileSync(getConfigPath(), JSON.stringify(validated, null, 2), 'utf-8')
  } catch (err) {
    console.warn('[meow-vpet] 配置文件写入失败(已忽略):', err)
  }
  return validated
}
