const { app, BrowserWindow, shell, dialog } = require('electron')
const path = require('node:path')

// 单实例：第二次双击时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// 数据落在用户目录，卸载不删
const dataDir = path.join(app.getPath('userData'), 'data')
process.env.TWB_DATA_DIR = dataDir

// 打包后 dist 在 resources/app/dist；开发时在项目根
const appRoot = path.join(__dirname, '..')
process.env.TWB_DIST_DIR = path.join(appRoot, 'dist')

// 随机端口，避免和开发环境的 4317 冲突
const PORT = 4600 + Math.floor(Math.random() * 200)
process.env.PORT = String(PORT)

let mainWindow = null

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
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // 外部链接用系统浏览器打开
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

try {
  require(path.join(appRoot, 'dist-server', 'index.cjs'))
} catch (e) {
  dialog.showErrorBox('启动失败', String(e && e.message ? e.message : e))
}

app.whenReady().then(createWindow)

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => app.quit())
