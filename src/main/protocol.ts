import { protocol } from 'electron'
import { join, normalize, extname } from 'path'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { getConfigDir } from './config'

// 自定义 protocol scheme:用于加载 ~/.meow-vpet/ 下的模型文件
// 为什么不用 file://?
//   dev 模式下渲染页是 http://localhost:xxxx,XHR/fetch 访问 file:// 会被 CORS 拦截
//   (pixi-live2d-display 内部用 XHR 加载模型 JSON 和子资源)
// 自定义 protocol 配合 corsEnabled: true,Chromium 自动添加 CORS 头,允许跨域访问
export const MODEL_SCHEME = 'meow-model'
// 固定 host:URL 形如 meow-model://local/models/Mao/Mao.model3.json
// 为什么不用空 host(meow-model:///models/...)?
//   scheme 注册为 standard 时,Chromium 会把空 host 后的第一段路径当作 host
//   即 meow-model:///models/Mao/... 被规范化为 meow-model://models/Mao/...
//   导致 pathname 丢失 'models' 段,handler 解析路径错误
//   用固定 host 'local' 避免此问题
export const MODEL_HOST = 'local'

// 必须在 app.whenReady() 之前调用
// 注册 scheme 为 privileged,否则无法在 fetch/XHR 中使用,也无法享受 CORS 支持
export function registerModelScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MODEL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: false
      }
    }
  ])
}

// 必须在 app.whenReady() 之后调用
// 处理 meow-model://local/models/Mao/Mao.model3.json 形式的请求
// 主进程读取 ~/.meow-vpet/<relPath> 文件并返回响应
export function registerModelProtocol(): void {
  protocol.handle(MODEL_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      // URL 格式: meow-model://local/models/Mao/Mao.model3.json
      //   host = 'local', pathname = '/models/Mao/Mao.model3.json'
      // 兼容情况:若 URL 被规范化为 meow-model://models/...(host='models')
      //   则 host 实际是路径的一部分,需拼回 pathname
      const host = url.host
      let pathname = decodeURIComponent(url.pathname)
      if (pathname.startsWith('/')) pathname = pathname.slice(1)

      let relPath: string
      if (host && host !== MODEL_HOST) {
        // URL 被规范化,host 实际上是路径的第一段(例如 'models')
        // 拼回 pathname 还原完整相对路径
        relPath = `${host}/${pathname}`
      } else {
        relPath = pathname
      }

      const configDir = getConfigDir()
      // normalize 防止 ../ 之类的路径,再校验是否仍在 configDir 下
      const absPath = normalize(join(configDir, relPath))

      // 安全检查:防止路径穿越到 ~/.meow-vpet/ 之外
      // Windows 路径大小写不敏感,统一转小写比较
      const configDirNorm = configDir.toLowerCase()
      const absPathNorm = absPath.toLowerCase()
      if (!absPathNorm.startsWith(configDirNorm)) {
        console.warn(`[${MODEL_SCHEME}] 403 Forbidden (路径穿越): ${request.url} -> ${absPath}`)
        return new Response('Forbidden', { status: 403 })
      }

      if (!existsSync(absPath)) {
        console.warn(`[${MODEL_SCHEME}] 404 Not Found: ${request.url} -> ${absPath}`)
        return new Response('Not Found', { status: 404 })
      }

      const data = await readFile(absPath)
      // 根据扩展名设置 Content-Type
      // pixi-live2d-display 加载 JSON 时需要正确的 MIME 才能正确解析
      const ext = extname(absPath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.moc3': 'application/octet-stream',
        '.moc': 'application/octet-stream',
        '.mp3': 'audio/mpeg',
        '.mtn': 'application/octet-stream'
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'

      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache'
        }
      })
    } catch (err) {
      console.error(`[${MODEL_SCHEME}] 处理请求失败:`, request.url, err)
      return new Response('Internal Error', { status: 500 })
    }
  })
}
