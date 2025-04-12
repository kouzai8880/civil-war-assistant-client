// electron/main.js
import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, session } from 'electron'
import { join } from 'path'
import { release } from 'os'
// 不再需要导入createRequire
import { autoUpdater } from 'electron-updater'
import LCUClient from './lcu-api.js'
import fs from 'fs'

// 不再需要createRequire，因为我们使用ES模块导入fs

// 禁用Windows 7的GPU加速
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// 设置Windows 10+通知的应用程序名称
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

// 设置字符编码为UTF-8
app.commandLine.appendSwitch('lang', 'zh-CN')
app.commandLine.appendSwitch('force-renderer-accessibility')

// 缓存相关设置，解决“拒绝访问”错误
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache') // 禁用GPU着色器磁盘缓存
app.commandLine.appendSwitch('disable-gpu-program-cache') // 禁用GPU程序缓存

// 会话持久化相关设置
app.commandLine.appendSwitch('persist-user-preferences') // 持久化用户偏好设置
app.commandLine.appendSwitch('enable-features', 'PersistentOriginTrials') // 启用持久化源试验

// 设置用户数据目录
const userDataPath = app.getPath('userData')

// 定义缓存目录路径，但不设置为自定义缓存目录
// 这样可以确保用户登录状态保存在默认的缓存目录中
const customCachePath = join(userDataPath, 'Cache')
const gpuCachePath = join(userDataPath, 'GPUCache')
const codeCachePath = join(userDataPath, 'Code Cache')
const serviceWorkerPath = join(userDataPath, 'Service Worker')

// 设置缓存大小限制，增加到100MB
app.commandLine.appendSwitch('disk-cache-size', '104857600')

// 设置控制台输出编码
process.env.LANG = 'zh_CN.UTF-8'
process.env.LC_ALL = 'zh_CN.UTF-8'
process.env.LC_CTYPE = 'zh_CN.UTF-8'

// 完全禁用控制台输出，避免乱码
const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn
const originalConsoleInfo = console.info

// 自定义日志输出函数
function customLog(prefix, ...args) {
  // 如果是开发模式，才输出到控制台
  if (!app.isPackaged) {
    const message = args.map(arg => {
      if (arg instanceof Error) {
        return `Error: ${arg.message}`
      }
      return String(arg)
    }).join(' ')

    // 使用英文前缀避免乱码
    if (prefix === 'ERROR') {
      originalConsoleError(`[ERROR] ${message}`)
    } else if (prefix === 'WARN') {
      originalConsoleWarn(`[WARN] ${message}`)
    } else if (prefix === 'INFO') {
      originalConsoleInfo(`[INFO] ${message}`)
    } else {
      originalConsoleLog(`[LOG] ${message}`)
    }
  }
}

// 重写控制台输出函数
console.log = function(...args) {
  customLog('LOG', ...args)
}

console.error = function(...args) {
  customLog('ERROR', ...args)
}

console.warn = function(...args) {
  customLog('WARN', ...args)
}

console.info = function(...args) {
  customLog('INFO', ...args)
}

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
// 记录是否是应用程序初始启动
let isInitialStartup = true

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
      preload: join(process.cwd(), app.isPackaged ? 'dist-electron/preload.js' : 'electron/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      // 允许渲染进程使用remote模块
      enableRemoteModule: false,
      // 缓存相关设置，解决“拒绝访问”错误
      // 不设置partition，使用默认的持久化会话，保留用户登录状态
      backgroundThrottling: false, // 禁用后台节流
      // 启用持久化存储
      persistentCookies: true,
      cache: true
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

  // 设置内容安全策略 (CSP)
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // 根据是否在开发模式下使用不同的 CSP
    const port = process.env.VITE_PORT || '3001'
    const cspDirectives = app.isPackaged ? [
      // 生产环境的 CSP
      "default-src 'self';",
      "script-src 'self';",
      "img-src 'self' data: https:;",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
      "connect-src 'self' http://localhost:3000 ws://localhost:3000;",
      "font-src 'self' data: https://fonts.gstatic.com;"
    ] : [
      // 开发环境的 CSP
      "default-src 'self';",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline';", // 开发模式需要 unsafe-eval
      "img-src 'self' data: https:;",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
      `connect-src 'self' http://localhost:${port} ws://localhost:${port} http://localhost:3000 ws://localhost:3000;`,
      "font-src 'self' data: https://fonts.gstatic.com;"
    ]

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives.join(' ')]
      }
    })
  })

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
      // 使用英文错误消息避免乱码
      const errorMsg = 'Cannot connect to League of Legends client. Please make sure the client is running.'
      console.error(errorMsg)

      // 如果不是初始启动时的连接尝试，则显示错误提示
      if (win && !isInitialStartup) {
        win.webContents.send('lcu-connection-error', '无法连接到英雄联盟客户端，请确保客户端已启动')
      }

      throw new Error(errorMsg)
    }

    // 连接成功后，将初始启动标志设置为否
    isInitialStartup = false

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
    // 使用英文错误消息避免乱码
    console.error('Failed to connect to LCU API:', error.message)
    lcuConnected = false
    lcuClient = null

    // 如果不是初始启动时的连接尝试，则显示错误提示
    if (win && !isInitialStartup) {
      win.webContents.send('lcu-connection-error', '无法连接到英雄联盟客户端，请确保客户端已启动')
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

// 定期检查LCU连接
setInterval(async () => {
  if (!lcuConnected) {
    try {
      await connectToLCU()
    } catch (error) {
      // 不在定期检查中输出错误日志，避免控制台刷屏
      // console.error('Periodic LCU connection check failed:', error.message)
    }
  }
}, 30000) // 每30秒检查一次

// 创建目录如果不存在
function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      console.log(`创建目录: ${dirPath}`)
      fs.mkdirSync(dirPath, { recursive: true })
    }
    return true
  } catch (error) {
    console.error(`创建目录失败 ${dirPath}: ${error.message}`)
    return false
  }
}

// 创建所有可能的缓存目录
function createCacheDirectories() {
  // 创建所有缓存目录
  ensureDirectoryExists(customCachePath);
  ensureDirectoryExists(gpuCachePath);
  ensureDirectoryExists(codeCachePath);
  ensureDirectoryExists(serviceWorkerPath);

  // 创建其他可能的缓存目录
  const otherCachePaths = [
    join(userDataPath, 'Local Storage'),
    join(userDataPath, 'Session Storage'),
    join(userDataPath, 'IndexedDB'),
    join(userDataPath, 'Cookies')
  ];

  otherCachePaths.forEach(path => ensureDirectoryExists(path));
}

// 处理缓存错误
function handleCacheErrors() {
  // 监听缓存错误，但不清除缓存
  process.on('uncaughtException', (error) => {
    // 只处理缓存相关错误
    if (error.message && (
      error.message.includes('cache') ||
      error.message.includes('Unable to move') ||
      error.message.includes('拒绝访问')
    )) {
      console.error('捕获到缓存错误，但不影响应用程序运行:', error.message);

      // 尝试重新创建缓存目录
      createCacheDirectories();
    } else {
      // 对于非缓存错误，重新抛出以便其他处理程序可以捕获
      throw error;
    }
  });
}

// 初始化会话数据
function initializeSession() {
  // 创建所有缓存目录
  createCacheDirectories();

  // 处理缓存错误
  handleCacheErrors();

  // 确保会话数据持久化
  const ses = session.defaultSession;

  // 设置持久化存储选项
  // 注意：Electron不支持setStoragePath方法
  // 我们使用默认的存储路径，它已经设置为userDataPath

  // 设置保持登录状态
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Keep-Alive'] = '300';
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  // 设置持久化Cookie
  ses.cookies.set({
    url: 'http://localhost:3000',
    name: 'persist',
    value: 'true',
    expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1年后过期
    httpOnly: false,
    secure: false
  }).catch(err => console.error('设置Cookie失败:', err));
}

// 应用程序事件处理
app.whenReady().then(() => {
  // 初始化会话数据
  initializeSession();

  // 创建主窗口
  createWindow();
})

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
