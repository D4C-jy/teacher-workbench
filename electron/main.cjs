const { app, BrowserWindow, shell, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// 单实例：第二次双击时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// 应用配置目录（只放 location.json 这种小文件）
const home = app.getPath('userData')
process.env.TWB_HOME = home

const locationFile = path.join(home, 'location.json')
const appRoot = path.join(__dirname, '..')
process.env.TWB_DIST_DIR = path.join(appRoot, 'dist')

// 端口优先固定 4600：origin 稳定，登录态（localStorage）才能跨重启保留
const BASE_PORT = 4600
let PORT = BASE_PORT

let mainWindow = null

/**
 * 暴露给本地服务调用的原生能力。
 * 前端通过 /api/native/* 触发，只有 Electron 里才存在，浏览器版会返回 501。
 */
global.__twbNative = {
  async pickFolder(defaultPath) {
    const r = await dialog.showOpenDialog({
      title: '选择数据存放位置',
      message: '学员、课时、课表等数据会保存在这里。建议放在非系统盘，重装系统也不丢。',
      buttonLabel: '就用这个文件夹',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  },
  relaunch() {
    app.relaunch()
    app.exit(0)
  },
}

/** 首次启动让用户选数据目录，避免默认落到 C 盘 */
async function ensureDataLocation() {
  try {
    if (fs.existsSync(locationFile)) return
  } catch {
    /* ignore */
  }

  // 建议路径：有 D/E/F 盘就优先用，其次是文档目录
  let suggestion = path.join(app.getPath('documents'), '教培工作台数据')
  if (process.platform === 'win32') {
    for (const drive of ['D:', 'E:', 'F:']) {
      try {
        if (fs.existsSync(`${drive}\\`)) {
          suggestion = `${drive}\\教培工作台数据`
          break
        }
      } catch {
        /* ignore */
      }
    }
  }

  const r = await dialog.showOpenDialog({
    title: '选择数据存放位置',
    message: '学员、课时、课表等数据会保存在这里。建议放在非系统盘，重装系统也不丢。',
    buttonLabel: '就用这个文件夹',
    defaultPath: suggestion,
    properties: ['openDirectory', 'createDirectory'],
  })

  const chosen = r.canceled || r.filePaths.length === 0 ? path.join(home, 'data') : r.filePaths[0]
  try {
    fs.mkdirSync(chosen, { recursive: true })
    fs.writeFileSync(locationFile, JSON.stringify({ dataDir: chosen }, null, 2), 'utf8')
  } catch (e) {
    dialog.showErrorBox(
      '目录不可用',
      `无法写入 ${chosen}，将使用默认位置。\n${String(e && e.message ? e.message : e)}`
    )
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const net = require('node:net')
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}

async function pickPort() {
  for (let p = BASE_PORT; p < BASE_PORT + 30; p++) {
    if (await isPortFree(p)) return p
  }
  return BASE_PORT + Math.floor(Math.random() * 100)
}

function waitForServer(tries, onReady) {
  fetch(`http://127.0.0.1:${PORT}/api/health`)
    .then((r) => (r.ok ? onReady() : retry()))
    .catch(retry)

  function retry() {
    if (tries <= 0) return onReady()
    setTimeout(() => waitForServer(tries - 1, onReady), 200)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#F4F2EE',
    title: '教培工作台',
    icon: path.join(appRoot, 'dist', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  waitForServer(40, () => {
    mainWindow.loadURL(`http://127.0.0.1:${PORT}/`).catch(() => {
      dialog.showErrorBox('启动失败', '本地服务没有起来，请重新打开一次。')
    })
  })
}

app.whenReady().then(async () => {
  await ensureDataLocation()

  PORT = await pickPort()
  process.env.PORT = String(PORT)

  try {
    require(path.join(appRoot, 'dist-server', 'index.cjs'))
  } catch (e) {
    dialog.showErrorBox('启动失败', String(e && e.message ? e.message : e))
  }

  createWindow()
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => app.quit())
