import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, statSync, cpSync } from 'fs'
import type { Dirent } from 'fs'
import { join, relative, basename, extname } from 'path'
import { getConfigDir } from './config'
import { MODEL_SCHEME, MODEL_HOST } from './protocol'

// 用户模型目录:~/.meow-vpet/models
// 内置模型首次启动时复制到这里,用户后续导入模型也放到此目录
export function getModelsDir(): string {
  const dir = join(getConfigDir(), 'models')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

// 内置模型源目录
// 三种运行模式:
//   1. electron-builder 打包:process.resourcesPath/models(extraResources)
//   2. npm 包安装:app.getAppPath()/resources/models(npm 包内含 resources/)
//   3. 开发模式:app.getAppPath()/src/renderer/public/models(源码目录)
function getBuiltinSourceDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'models')
  }
  const appPath = app.getAppPath()
  // npm 包模式:resources/models 已由 copy-resources 构建步骤复制
  const npmPkgDir = join(appPath, 'resources/models')
  if (existsSync(npmPkgDir)) {
    return npmPkgDir
  }
  // 开发模式:从源码目录加载
  return join(appPath, 'src/renderer/public/models')
}

// 检查目录中是否存在模型定义文件(*.model3.json 或 *.model.json)
// 用于判断目标模型目录是否"已正确安装",避免目录存在但内容不全时跳过复制
function hasModelJson(dir: string): boolean {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.model3.json') || entry.name.endsWith('.model.json'))) {
        return true
      }
    }
  } catch {
    /* ignore */
  }
  return false
}

// 首次启动时将内置模型复制到用户模型目录
// 复制策略:逐个内置模型子目录,检查目标目录是否已有 model json 文件
//   - 目标目录不存在 → 复制整个目录
//   - 目标目录存在但没有 model json(内容不全/损坏) → 重新复制整个目录
//   - 目标目录存在且有 model json(用户已安装) → 跳过,保留用户修改
export function ensureBuiltinModels(): void {
  const sourceDir = getBuiltinSourceDir()
  const targetDir = getModelsDir()

  console.log('[models] ensureBuiltinModels')
  console.log('[models]   sourceDir:', sourceDir)
  console.log('[models]   targetDir:', targetDir)
  console.log('[models]   sourceDir exists:', existsSync(sourceDir))

  if (!existsSync(sourceDir)) {
    console.warn('[models] 内置模型源目录不存在,跳过复制')
    return
  }

  let entries: Dirent[]
  try {
    entries = readdirSync(sourceDir, { withFileTypes: true })
  } catch (err) {
    console.warn('[models] 读取内置模型源目录失败:', err)
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const src = join(sourceDir, entry.name)
    const dst = join(targetDir, entry.name)
    // 判断目标目录是否已正确安装(有 model json 文件)
    const dstExists = existsSync(dst)
    const dstHasModel = dstExists && hasModelJson(dst)
    if (dstHasModel) {
      console.log(`[models]   跳过(已安装): ${entry.name}`)
      continue
    }
    try {
      // 目录不存在或内容不全,整目录复制
      cpSync(src, dst, { recursive: true })
      console.log(`[models]   复制内置模型: ${entry.name} -> ${dst}`)
    } catch (err) {
      console.warn(`[models]   复制内置模型失败: ${entry.name}`, err)
    }
  }
}

// 模型条目:下拉选项使用
export interface ModelEntry {
  // 显示名称(优先用 model3.json 的 FileReferences 或目录名)
  name: string
  // 相对 ~/.meow-vpet/ 的路径,例如 "models/Mao/Mao.model3.json"
  path: string
  // 模型格式: 'cubism4' | 'cubism2'
  format: 'cubism4' | 'cubism2'
}

// 扫描用户模型目录,返回所有可用模型
// 规则:递归查找 *.model3.json (Cubism 4) 和 *.model.json (Cubism 2)
// 排除 .model3.json 已经覆盖的情况(model3 优先,同名 model.json 跳过)
export function listAvailableModels(): ModelEntry[] {
  const modelsDir = getModelsDir()
  const results: ModelEntry[] = []

  if (!existsSync(modelsDir)) return results

  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full)
      } else if (st.isFile()) {
        const ext = extname(entry).toLowerCase()
        if (ext === '.json') {
          // 区分 model3.json(Cubism 4)和 model.json(Cubism 2)
          // 仅匹配以 .model3.json 或 .model.json 结尾的文件,避免误识别其他 json
          if (entry.endsWith('.model3.json')) {
            const relPath = relative(getConfigDir(), full).replace(/\\/g, '/')
            const name = deriveModelName(entry, full, true)
            results.push({ name, path: relPath, format: 'cubism4' })
          } else if (entry.endsWith('.model.json')) {
            const relPath = relative(getConfigDir(), full).replace(/\\/g, '/')
            const name = deriveModelName(entry, full, false)
            results.push({ name, path: relPath, format: 'cubism2' })
          }
        }
      }
    }
  }

  walk(modelsDir)

  // 按名称排序,方便用户查找
  results.sort((a, b) => a.name.localeCompare(b.name))
  return results
}

// 推导模型显示名称
// Cubism 4:尝试从 model3.json 的 FileReferences 读取(目前简化为用文件名)
// Cubism 2:从 model.json 的 "name" 字段读取(目前简化为用文件名)
// 兜底:用文件名(去掉 .model3.json / .model.json 后缀)
function deriveModelName(fileName: string, _fullPath: string, isCubism4: boolean): string {
  const suffix = isCubism4 ? '.model3.json' : '.model.json'
  return basename(fileName, suffix)
}

// 将相对 ~/.meow-vpet/ 的路径解析为 meow-model://local/<relPath> URL
// 渲染层 Live2DModel.from() 接受 URL,通过自定义 protocol 加载
// 为什么用 meow-model:// 而非 file://?
//   dev 模式下渲染页是 http://localhost:xxxx,XHR/fetch 访问 file:// 会被 CORS 拦截
//   pixi-live2d-display 内部用 XHR 加载模型 JSON 和子资源(moc3、纹理等)
//   自定义 protocol 配合 corsEnabled: true,Chromium 自动添加 CORS 头,允许跨域访问
// 为什么用固定 host 'local' 而非空 host?
//   scheme 注册为 standard 时,Chromium 会把空 host 后的第一段路径当作 host
//   即 meow-model:///models/Mao/... 被规范化为 meow-model://models/Mao/...
//   导致 pathname 丢失 'models' 段,handler 解析路径错误
//   用固定 host 'local' 避免此问题
// 子资源加载:pixi-live2d-display 基于主 URL 解析相对路径,生成同 scheme 的 URL
//   例如主 URL = meow-model://local/models/Mao/Mao.model3.json
//   纹理路径 "Mao.2048/texture_00.png" 解析为 meow-model://local/models/Mao/Mao.2048/texture_00.png
//   主进程 protocol handler 读取对应文件返回,完整支持子资源加载
// 也接受已经是 URL 的输入(兼容旧配置)
export function resolveModelUrl(relPath: string): string {
  // 兼容旧配置:以 /models/ 开头的路径(开发模式下从 dev server 根加载)
  // 转为新格式:models/...
  let normalized = relPath
  if (normalized.startsWith('/models/')) {
    normalized = normalized.slice(1) // 去掉前导 /
  }

  // 如果已经是 meow-model:// / file:// / http(s) URL,直接返回
  if (
    normalized.startsWith(`${MODEL_SCHEME}://`) ||
    /^file:\/\//.test(normalized) ||
    /^https?:\/\//.test(normalized)
  ) {
    return normalized
  }

  // 拼接为 meow-model://local/<relPath>
  // 固定 host 'local',pathname 为 /<relPath>
  return `${MODEL_SCHEME}://${MODEL_HOST}/${normalized}`
}
