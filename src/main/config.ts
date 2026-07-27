import { z } from 'zod'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// 配置 schema(zod 校验)
const configSchema = z.object({
  meowToolUrl: z.string().default('http://localhost:4399'),
  live2dModelPath: z.string().default('/models/shizuku/shizuku.model.json'),
  agentId: z.string().optional(),
  // 系统提示词(每次对话会作为 system 消息 prepend 到 messages 数组开头)
  systemPrompt: z.string().optional(),
  windowX: z.number().optional(),
  windowY: z.number().optional(),
  windowScale: z.number().default(0.3)
})

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
    return configSchema.parse(parsed)
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
