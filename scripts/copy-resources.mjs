// 构建前从 src/renderer/public 复制模型和 Live2D 运行时库到 resources/
// 源码唯一来源是 src/renderer/public/{models,lib},resources/{models,lib} 视为生成物
// 触发时机:npm run build / build:win / build:mac / build:linux / pack:win 前
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// from 相对项目根目录,to 相对项目根目录
const tasks = [
  { from: 'src/renderer/public/models', to: 'resources/models' },
  { from: 'src/renderer/public/lib', to: 'resources/lib' }
]

let copied = 0
for (const { from, to } of tasks) {
  const fromPath = resolve(root, from)
  const toPath = resolve(root, to)
  if (!existsSync(fromPath)) {
    console.warn(`[copy-resources] 源目录不存在,跳过: ${from}`)
    continue
  }
  // 清空目标目录,避免残留旧文件(例如源码中已删除的模型)
  if (existsSync(toPath)) {
    rmSync(toPath, { recursive: true, force: true })
  }
  mkdirSync(toPath, { recursive: true })
  cpSync(fromPath, toPath, { recursive: true })
  console.log(`[copy-resources] ${from} -> ${to}`)
  copied++
}
console.log(`[copy-resources] 完成,共复制 ${copied} 个目录`)
