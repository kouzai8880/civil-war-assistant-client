// electron/main.js
import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } from 'electron'
import { join } from 'path'
import { release } from 'os'
import { createRequire } from 'module'
import { autoUpdater } from 'electron-updater'
import LCUClient from './lcu-api.js'

// 创建require函数，用于加载node模块
const require = createRequire(import.meta.url)

// 禁用Windows 7的GPU加速
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// 设置Windows 10+通知的应用程序名称
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

// 允许启动多个实例
// 注释掉单例锁代码
// if (!app.requestSingleInstanceLock()) {
//   app.quit()
//   process.exit(0)
// }

// 应用程序根路径
const ROOT_PATH = {
  // /dist
  dist: join(process.cwd(), 'dist'),
  // /dist or /public
  public: join(process.cwd(), app.isPackaged ? 'dist' : 'public')
}

// 全局变量
let win = null // 主窗口
let tray = null // 系统托盘
let isQuitting = false // 是否正在退出应用
let lcuConnected = false // 是否已连接到LCU API
let lcuClient = null // LCU API客户端实例

// 创建主窗口
async function createWindow() {
  // 创建浏览器窗口
  win = new BrowserWindow({
    title: '英雄联盟内战助手',
    width: 1920,
    height: 1080,
    minWidth: 1024,
    minHeight: 768,
    icon: join(ROOT_PATH.public, 'favicon.ico'),
    webPreferences: {
      preload: join(process.cwd(), 'electron/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      // 允许渲染进程使用remote模块
      enableRemoteModule: false
    }
  })

  // 设置窗口菜单
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '设置',
          click: () => {
            win.webContents.send('open-settings')
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(win, {
              type: 'info',
              title: '关于英雄联盟内战助手',
              message: '英雄联盟内战助手 v' + app.getVersion(),
              detail: '一款专为英雄联盟内战设计的组织和管理工具。\n\n© 2023-2024 内战助手团队',
              buttons: ['确定']
            })
          }
        },
        {
          label: '检查更新',
          click: () => {
            checkForUpdates(true)
          }
        },
        {
          label: '访问官网',
          click: () => {
            shell.openExternal('https://example.com')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  // 加载应用
  if (app.isPackaged) {
    win.loadFile(join(ROOT_PATH.dist, 'index.html'))
  } else {
    // 开发模式下，使用Vite开发服务器
    // 使用环境变量中的端口或默认端口3001
    const port = process.env.VITE_PORT || '3001'
    win.loadURL(`http://localhost:${port}`)
    // 打开开发者工具 - 默认关闭
    // 如果需要打开开发者工具，可以取消下面这行的注释
    // win.webContents.openDevTools()
  }

  // 窗口关闭事件处理
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
      return false
    }
  })

  // 创建系统托盘
  createTray()

  // 检查更新
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdates()
    }, 3000)
  }
}

// 创建系统托盘
function createTray() {
  // 创建托盘图标
  const icon = nativeImage.createFromPath(join(ROOT_PATH.public, 'favicon.ico'))
  tray = new Tray(icon)

  // 设置托盘菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        win.show()
      }
    },
    {
      label: 'LCU状态',
      submenu: [
        {
          label: lcuConnected ? '已连接' : '未连接',
          enabled: false
        },
        {
          label: '重新连接',
          click: () => {
            connectToLCU()
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('英雄联盟内战助手')
  tray.setContextMenu(contextMenu)

  // 点击托盘图标显示主窗口
  tray.on('click', () => {
    win.show()
  })
}

// 连接到LCU API
async function connectToLCU() {
  try {
    // 创建LCU客户端实例
    lcuClient = new LCUClient()

    // 初始化客户端
    const connected = await lcuClient.init()
    lcuConnected = connected

    if (!connected) {
      throw new Error('无法连接到英雄联盟客户端，请确保客户端已启动')
    }

    // 注册游戏状态变化事件
    lcuClient.on('gameflow-phase', (phase) => {
      console.log('游戏状态变化:', phase)

      // 通知渲染进程
      if (win) {
        win.webContents.send('gameflow-phase-changed', phase)
      }
    })

    // 获取当前玩家信息
    const summoner = await lcuClient.getCurrentSummoner()
    console.log('当前玩家:', summoner.displayName)

    // 更新托盘菜单
    if (tray) {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: '显示主窗口',
          click: () => {
            win.show()
          }
        },
        {
          label: 'LCU状态',
          submenu: [
            {
              label: lcuConnected ? `已连接 (${summoner.displayName})` : '未连接',
              enabled: false
            },
            {
              label: '重新连接',
              click: () => {
                connectToLCU()
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ])

      tray.setContextMenu(contextMenu)
    }

    // 通知渲染进程
    if (win) {
      win.webContents.send('lcu-connected', summoner)
    }

    return true
  } catch (error) {
    console.error('连接LCU API失败:', error)
    lcuConnected = false
    lcuClient = null

    // 通知渲染进程
    if (win) {
      win.webContents.send('lcu-connection-error', error.message)
    }

    return false
  }
}

// 检查更新
function checkForUpdates(showNotification = false) {
  if (!app.isPackaged) {
    if (showNotification) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: '更新检查',
        message: '开发模式下不检查更新',
        buttons: ['确定']
      })
    }
    return
  }

  autoUpdater.checkForUpdates()

  if (showNotification) {
    dialog.showMessageBox(win, {
      type: 'info',
      title: '更新检查',
      message: '正在检查更新...',
      buttons: ['确定']
    })
  }
}

// 自动更新事件处理
autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox(win, {
    type: 'info',
    title: '发现新版本',
    message: `发现新版本: ${info.version}`,
    detail: '新版本正在下载中，下载完成后将自动安装',
    buttons: ['确定']
  })
})

autoUpdater.on('update-not-available', (info) => {
  dialog.showMessageBox(win, {
    type: 'info',
    title: '没有更新',
    message: '当前已经是最新版本',
    buttons: ['确定']
  })
})

autoUpdater.on('error', (err) => {
  dialog.showMessageBox(win, {
    type: 'error',
    title: '更新错误',
    message: '更新过程中发生错误',
    detail: err.message,
    buttons: ['确定']
  })
})

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox(win, {
    type: 'info',
    title: '更新已下载',
    message: `新版本 ${info.version} 已下载完成`,
    detail: '点击"立即安装"关闭应用并安装更新',
    buttons: ['立即安装', '稍后安装'],
    defaultId: 0
  }).then((result) => {
    if (result.response === 0) {
      isQuitting = true
      autoUpdater.quitAndInstall()
    }
  })
})

// IPC通信处理
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

ipcMain.handle('connect-to-lcu', async () => {
  return await connectToLCU()
})

ipcMain.handle('check-for-updates', () => {
  checkForUpdates(true)
})

ipcMain.handle('open-external-link', (event, url) => {
  shell.openExternal(url)
})

// LCU API相关的IPC处理
ipcMain.handle('lcu-get-current-summoner', async () => {
  if (!lcuConnected || !lcuClient) {
    throw new Error('未连接到LCU API')
  }
  return await lcuClient.getCurrentSummoner()
})

ipcMain.handle('lcu-get-gameflow-phase', async () => {
  if (!lcuConnected || !lcuClient) {
    throw new Error('未连接到LCU API')
  }
  return await lcuClient.getGameflowPhase()
})

ipcMain.handle('lcu-get-current-game', async () => {
  if (!lcuConnected || !lcuClient) {
    throw new Error('未连接到LCU API')
  }
  return await lcuClient.getCurrentGame()
})

ipcMain.handle('lcu-get-ranked-stats', async (event, puuid) => {
  if (!lcuConnected || !lcuClient) {
    throw new Error('未连接到LCU API')
  }
  return await lcuClient.getRankedStats(puuid)
})

ipcMain.handle('lcu-get-match-history', async (event, puuid) => {
  if (!lcuConnected || !lcuClient) {
    throw new Error('未连接到LCU API')
  }
  return await lcuClient.getMatchHistory(puuid)
})

ipcMain.handle('lcu-get-game-details', async (event, gameId) => {
  if (!lcuConnected || !lcuClient) {
    throw new Error('未连接到LCU API')
  }
  return await lcuClient.getGameDetails(gameId)
})

// 应用程序事件处理
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    win.show()
  }
})

// 已禁用单例锁，不需要处理第二个实例启动
// app.on('second-instance', () => {
//   if (win) {
//     if (win.isMinimized()) win.restore()
//     win.show()
//     win.focus()
//   }
// })

// 应用退出前清理
app.on('before-quit', () => {
  isQuitting = true

  // 关闭LCU客户端连接
  if (lcuClient) {
    lcuClient.close()
    lcuClient = null
  }
})
