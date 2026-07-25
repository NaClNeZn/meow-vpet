import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

// 创建托盘图标与右键菜单
export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  // 托盘图标路径(实际项目中应放图标到 resources/tray/icon.png)
  const iconPath = join(__dirname, '../../resources/tray/icon.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      // 占位:空图标
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('meow-vpet')

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示',
      click: () => {
        const win = getMainWindow()
        if (win) {
          win.show()
          win.focus()
        }
      }
    },
    {
      label: '隐藏',
      click: () => {
        const win = getMainWindow()
        if (win) win.hide()
      }
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        const win = getMainWindow()
        if (win) {
          win.webContents.send('menu:open-settings')
          win.show()
          win.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // 单击托盘图标切换显示/隐藏
  tray.on('click', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isVisible()) {
        win.hide()
      } else {
        win.show()
        win.focus()
      }
    }
  })

  return tray
}

// 销毁托盘
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
