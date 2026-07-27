import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的 API 接口
const api = {
  // 获取应用信息
  getAppInfo: () => ipcRenderer.invoke('app:getAppInfo'),
  // 设置是否忽略鼠标事件(实现穿透点击)
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.invoke('window:setIgnoreMouseEvents', ignore),
  // 启动/停止窗口拖拽(主进程轮询鼠标坐标,避免渲染层 screenX/Y 不可靠)
  startWindowDrag: () => ipcRenderer.invoke('window:startDrag'),
  stopWindowDrag: () => ipcRenderer.invoke('window:stopDrag'),
  // 实时调整窗口尺寸:scale 为 0.5-2.0 的乘数,基于 360x480
  setWindowSize: (scale: number) => ipcRenderer.invoke('window:setSize', scale),
  // 启动/停止全局鼠标跟踪(用于桌宠在窗口外也能跟随鼠标方向)
  // 主进程 30fps 轮询 screen.getCursorScreenPoint,转换为窗口内 CSS 像素后推送
  startMouseTracking: () => ipcRenderer.invoke('window:startMouseTracking'),
  stopMouseTracking: () => ipcRenderer.invoke('window:stopMouseTracking'),
  // 监听全局鼠标位置(窗口内 CSS 像素坐标,可能为负数或超出窗口范围)
  onGlobalMousePosition: (callback: (pos: { x: number; y: number }) => void) =>
    ipcRenderer.on('mouse:global', (_e, pos) => callback(pos)),
  // 监听后端状态变化
  onBackendStatusChange: (callback: (status: string) => void) =>
    ipcRenderer.on('backend:status', (_e, status) => callback(status)),
  // 主动查询当前后端状态(页面加载后补齐错过的状态)
  getBackendStatus: () => ipcRenderer.invoke('backend:getStatus'),
  // 配置读写
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke('config:save', config),
  // 扫描可用模型列表(供设置页下拉)
  // 返回 [{ name, path, format }],path 为相对 ~/.meow-vpet/ 的路径
  listModels: () =>
    ipcRenderer.invoke('models:list') as Promise<
      Array<{ name: string; path: string; format: 'cubism4' | 'cubism2' }>
    >,
  // 将相对路径解析为可加载的 file:// URL
  resolveModelUrl: (relPath: string) =>
    ipcRenderer.invoke('models:resolve-url', relPath) as Promise<string>,
  // 监听打开设置菜单事件
  onOpenSettings: (callback: () => void) =>
    ipcRenderer.on('menu:open-settings', () => callback())
}

// 通过 contextBridge 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld('app', api)
