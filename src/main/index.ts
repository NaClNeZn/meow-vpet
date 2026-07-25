import { app, BrowserWindow, shell, ipcMain, Menu, screen } from 'electron'
import { join } from 'path'
import { createTray, destroyTray } from './tray'
import { startMeowTool, waitForMeowTool, stopMeowTool } from './meow-tool'
import { loadConfig, saveConfig } from './config'

let mainWindow: BrowserWindow | null = null
let isQuitting = false
// 拖拽标志:拖拽期间跳过 move 事件的节流保存,避免频繁写配置文件导致 EPERM
// 拖拽结束时由 stopDrag 保存一次最终位置
let isDragging = false

// 当前后端状态(供渲染进程主动查询,避免 IPC 事件在页面加载前丢失)
let currentBackendStatus = 'starting'

// 更新后端状态并推送到渲染进程
function sendBackendStatus(status: string): void {
  currentBackendStatus = status
  getMainWindow()?.webContents.send('backend:status', status)
}

// 获取主窗口实例(供其他主进程模块使用)
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

// 创建应用主窗口
function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 480,
    transparent: true, // 透明背景,用于显示桌宠
    frame: false, // 无边框
    alwaysOnTop: true, // 始终置顶
    skipTaskbar: true, // 不在任务栏显示
    resizable: false, // 禁止调整大小
    maximizable: false, // 禁止最大化
    hasShadow: false, // 透明窗口不要阴影
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true, // 上下文隔离,安全考虑
      nodeIntegration: false // 渲染进程不直接使用 Node
    }
  })

  // 开发模式加载 dev server,生产模式加载本地文件
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 外部链接使用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 窗口右键菜单
  mainWindow.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      {
        label: '打开设置',
        click: () => {
          mainWindow?.webContents.send('menu:open-settings')
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => app.quit()
      }
    ])
    menu.popup()
  })

  // 应用持久化的窗口位置,并校验是否在屏幕可见区域内
  // 防止上次拖拽飞出屏幕后,持久化了不可见的位置导致窗口"消失"
  const config = loadConfig()
  if (config.windowX !== undefined && config.windowY !== undefined) {
    const [w, h] = mainWindow.getSize()
    // 找到该点所在显示器,若点不在任何显示器内则回退到主屏
    let display = screen.getDisplayMatching({ x: config.windowX, y: config.windowY, width: w, height: h })
    if (!display || display.bounds.width === 0) {
      display = screen.getPrimaryDisplay()
    }
    const workArea = display.workArea
    // 窗口中心必须在工作区内,确保角色(居中显示)始终可见
    const clampedX = Math.max(
      workArea.x,
      Math.min(workArea.x + workArea.width - w, config.windowX)
    )
    const clampedY = Math.max(
      workArea.y,
      Math.min(workArea.y + workArea.height - h, config.windowY)
    )
    mainWindow.setPosition(Math.round(clampedX), Math.round(clampedY))
  }

  // 窗口位置变化处理:
  // 非拖拽的 move(如程序 setPosition、snap)做边界 clamp 防止飞出屏幕,
  // 并节流保存到配置文件。
  // 拖拽中完全跳过:拖拽循环已用 dragBounds clamp,此处二次 setPosition 会与
  // 拖拽循环交错(setPosition 同步返回但 move 事件异步触发,clamping 标志无效),
  // 在透明窗口下产生闪烁。拖拽结束由 stopDrag 保存最终位置。
  const WINDOW_W = 360
  const WINDOW_H = 480
  let savePositionTimer: NodeJS.Timeout | null = null
  let clamping = false // 防止 setPosition 触发 move 递归
  let lastSavedPos = { x: 0, y: 0 }
  mainWindow.on('move', () => {
    if (!mainWindow) return
    // 拖拽中跳过:拖拽循环已处理 clamp,且避免与拖拽循环交错产生闪烁
    if (isDragging) return
    const [x, y] = mainWindow.getPosition()
    // 边界 clamp(仅非拖拽场景:程序 setPosition、外部 move 等)
    if (!clamping) {
      const display = screen.getDisplayMatching({ x, y, width: WINDOW_W, height: WINDOW_H })
      const wa = display.workArea
      const maxX = wa.x + wa.width - WINDOW_W
      const maxY = wa.y + wa.height - WINDOW_H
      const newX = Math.max(wa.x, Math.min(maxX, x))
      const newY = Math.max(wa.y, Math.min(maxY, y))
      if (newX !== x || newY !== y) {
        clamping = true
        mainWindow.setPosition(newX, newY)
        clamping = false
      }
    }
    // 节流保存配置(拖拽中不保存,避免同步 writeFileSync 阻塞主进程导致拖拽卡顿)
    if (savePositionTimer) clearTimeout(savePositionTimer)
    savePositionTimer = setTimeout(() => {
      if (!mainWindow) return
      const [cx, cy] = mainWindow.getPosition()
      if (cx !== lastSavedPos.x || cy !== lastSavedPos.y) {
        lastSavedPos = { x: cx, y: cy }
        saveConfig({ windowX: cx, windowY: cy })
      }
    }, 500)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

// 应用就绪后创建窗口 + 注册 IPC + 创建托盘 + 启动后端
app.whenReady().then(async () => {
  createWindow()
  registerIpcHandlers()
  createTray(getMainWindow)
  // 启动 meow-tool 后端
  await startMeowToolAndNotify()
})

// 退出前优雅关闭 meow-tool + 销毁托盘
app.on('before-quit', async (event) => {
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  await stopMeowTool()
  destroyTray()
  app.exit(0)
})

// 所有窗口关闭时退出应用(macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// macOS 点击 dock 图标时重新创建窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC handler 注册
function registerIpcHandlers(): void {
  // 设置是否忽略鼠标事件(点击穿透)
  // ignore=true 表示穿透,{ forward: true } 让 mousemove 仍可转发到渲染进程,
  // 用于实时判断鼠标是否回到模型上,从而取消穿透
  ipcMain.handle('window:setIgnoreMouseEvents', (_event, ignore: boolean) => {
    console.log('[main] setIgnoreMouseEvents', ignore)
    const win = getMainWindow()
    if (!win) return
    // 不使用 forward: true —— 该选项在窗口被 setPosition 移动后会导致
    // Chromium hit-test 损坏,使得穿透→不穿透切换时吞掉第一次 click。
    // 改用全局鼠标跟踪(screen.getCursorScreenPoint)在主进程层面检测鼠标位置,
    // 渲染进程的 handleGlobalMouse 会判断是否在模型/按钮上并切换穿透状态。
    win.setIgnoreMouseEvents(ignore)
  })

  // 窗口拖拽:主进程轮询 screen.getCursorScreenPoint,用绝对定位法移动窗口
  // 关键点(避免方向反转):
  // 1. 拖拽开始时一次性记录起点 cursor 和起点 window 位置
  // 2. 每帧只读 cursor,用 (当前cursor - 起点cursor) 计算窗口绝对新位置
  // 3. 全程不调用 getPosition()/getSize(),避免透明窗口 DPI 缩放下坐标系不一致
  // 4. 用固定窗口尺寸 360x480 计算边界,不用 getSize()
  const WINDOW_W = 360
  const WINDOW_H = 480
  let dragInterval: NodeJS.Timeout | null = null
  let dragStartCursor: { x: number; y: number } | null = null
  let dragStartWindow: { x: number; y: number } | null = null
  let dragBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null

  ipcMain.handle('window:startDrag', () => {
    const win = getMainWindow()
    if (!win) return
    // 防止重复 startDrag
    if (dragInterval) {
      clearInterval(dragInterval)
      dragInterval = null
    }
    isDragging = true
    // 拖拽中暂停全局鼠标跟踪:拖拽循环已 60fps setPosition,
    // 再叠加 30fps 的跟踪 IPC 会增加主进程负担,在透明窗口下产生闪烁
    if (mouseTrackingInterval) {
      clearInterval(mouseTrackingInterval)
      mouseTrackingInterval = null
    }
    dragStartCursor = screen.getCursorScreenPoint()
    const [x, y] = win.getPosition()
    dragStartWindow = { x, y }
    // 一次性确定边界(用窗口当前所在显示器的工作区)
    const display = screen.getDisplayMatching({ x, y, width: WINDOW_W, height: WINDOW_H })
    const wa = display.workArea
    dragBounds = {
      minX: wa.x,
      maxX: wa.x + wa.width - WINDOW_W,
      minY: wa.y,
      maxY: wa.y + wa.height - WINDOW_H
    }
    if (dragInterval) clearInterval(dragInterval)
    // 60fps 轮询 cursor,用绝对位移计算窗口新位置
    // 记录上一帧设置的位置,相同时跳过 setPosition:
    // 边界处鼠标继续往外移动时 newX 被 clamp 不变,若仍调用 setPosition 会反复触发
    // move 事件,在透明窗口下导致 Chromium 重绘累积误差(UI 元素视觉漂移)
    let lastSetX: number | null = null
    let lastSetY: number | null = null
    dragInterval = setInterval(() => {
      if (!dragStartCursor || !dragStartWindow || !dragBounds || !win) return
      const cur = screen.getCursorScreenPoint()
      const totalDx = cur.x - dragStartCursor.x
      const totalDy = cur.y - dragStartCursor.y
      if (totalDx === 0 && totalDy === 0) return
      let newX = dragStartWindow.x + totalDx
      let newY = dragStartWindow.y + totalDy
      // 用固定边界限制
      newX = Math.max(dragBounds.minX, Math.min(dragBounds.maxX, newX))
      newY = Math.max(dragBounds.minY, Math.min(dragBounds.maxY, newY))
      const roundedX = Math.round(newX)
      const roundedY = Math.round(newY)
      // 位置未变(常见于卡在边界)则跳过,避免无意义 setPosition 触发重绘
      if (roundedX === lastSetX && roundedY === lastSetY) return
      lastSetX = roundedX
      lastSetY = roundedY
      win.setPosition(roundedX, roundedY)
    }, 16)
  })

  ipcMain.handle('window:stopDrag', () => {
    isDragging = false
    if (dragInterval) {
      clearInterval(dragInterval)
      dragInterval = null
    }
    dragStartCursor = null
    dragStartWindow = null
    dragBounds = null
    // 拖拽结束后保存最终位置
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition()
      saveConfig({ windowX: x, windowY: y })
      // 拖拽结束后设为不穿透,确保 +号可点击
      // (移除了 forward: true,不再有 hit-test 损坏问题)
      if (!mainWindow.isDestroyed()) {
        mainWindow.setIgnoreMouseEvents(false)
      }
    }
    // 恢复全局鼠标跟踪(拖拽开始时暂停以减少主进程负担)
    if (mouseTrackingInterval === null && mainWindow && !mainWindow.isDestroyed()) {
      startMouseTrackingInternal()
    }
  })

  // 全局鼠标跟踪:让桌宠在鼠标移出 app 窗口外时也能跟随鼠标方向
  // 主进程通过 screen.getCursorScreenPoint() 获取屏幕级物理像素坐标,
  // 转换为窗口内 CSS 像素坐标后推送到渲染进程,渲染进程直接调用 model.focus()
  // 注意:screen 坐标 / win.getPosition() 都是物理像素,model.focus 期望 CSS 像素,
  // 所以要用 (cursor - winPos) / scaleFactor 换算
  let mouseTrackingInterval: NodeJS.Timeout | null = null
  function startMouseTrackingInternal(): void {
    const win = getMainWindow()
    if (!win) return
    if (mouseTrackingInterval) return // 已在跟踪,避免重复启动
    // 30fps 足够流畅,且不会过度占用 CPU
    mouseTrackingInterval = setInterval(() => {
      if (!win || win.isDestroyed()) {
        mouseTrackingInterval = null
        return
      }
      const cursor = screen.getCursorScreenPoint()
      const [winX, winY] = win.getPosition()
      // 找到窗口所在显示器,获取 DPI 缩放因子
      const display = screen.getDisplayMatching({
        x: winX,
        y: winY,
        width: WINDOW_W,
        height: WINDOW_H
      })
      const scaleFactor = display.scaleFactor || 1
      // 物理像素差 -> CSS 像素(与 renderer 中 clientX/clientY 量纲一致)
      const cssX = (cursor.x - winX) / scaleFactor
      const cssY = (cursor.y - winY) / scaleFactor
      win.webContents.send('mouse:global', { x: cssX, y: cssY })
    }, 33)
  }

  ipcMain.handle('window:startMouseTracking', () => {
    startMouseTrackingInternal()
  })

  ipcMain.handle('window:stopMouseTracking', () => {
    if (mouseTrackingInterval) {
      clearInterval(mouseTrackingInterval)
      mouseTrackingInterval = null
    }
  })

  // 读取配置
  ipcMain.handle('config:get', () => {
    return loadConfig()
  })

  // 保存配置(部分更新)
  ipcMain.handle('config:save', (_event, partial: Record<string, unknown>) => {
    return saveConfig(partial)
  })

  // 渲染进程主动查询当前后端状态(页面加载后补齐错过的状态)
  ipcMain.handle('backend:getStatus', () => {
    return currentBackendStatus
  })
}

// 启动 meow-tool 后端并通过 IPC 推送状态到渲染进程
async function startMeowToolAndNotify(): Promise<void> {
  sendBackendStatus('starting')

  try {
    await startMeowTool()
    sendBackendStatus('waiting')
    const ready = await waitForMeowTool()
    if (ready) {
      sendBackendStatus('ready')
    } else {
      sendBackendStatus('timeout')
    }
  } catch (err) {
    console.error('[meow-vpet] 启动 meow-tool 失败:', err)
    sendBackendStatus('error')
  }
}
