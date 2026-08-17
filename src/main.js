'use strict'

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { loadConfig } = require('./config')
const { DshServer } = require('./server')
const { injectMarisaTheme } = require('./theme')
const { createPetWindow, closePetWindow, notifyTurn } = require('./pet')

const cfg = loadConfig()

let win = null
let server = null
let readyUrl = null
let lastStatus = { state: 'starting' }

const logs = []
const MAX_LOGS = 1000

function pushLog(line) {
  console.log(line)
  logs.push(line)
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  if (win && !win.isDestroyed()) win.webContents.send('dsh:log', line)
}

function setStatus(status) {
  console.log('[dsh-desktop] status: ' + JSON.stringify(status))
  lastStatus = status
  if (win && !win.isDestroyed()) win.webContents.send('dsh:status', status)
}

function loadingPath() {
  return path.join(__dirname, '..', 'ui', 'loading.html')
}

function showLoading() {
  if (win && !win.isDestroyed()) void win.loadFile(loadingPath())
}

function showUrl(url) {
  if (win && !win.isDestroyed()) void win.loadURL(url)
}

function originOf(raw) {
  try { return new URL(raw).origin } catch (e) { return raw }
}

function isHttp(url) {
  return url.startsWith('http://') || url.startsWith('https://')
}

function createWindow() {
  win = new BrowserWindow({
    width: cfg.window && cfg.window.width ? cfg.window.width : 1280,
    height: cfg.window && cfg.window.height ? cfg.window.height : 860,
    minWidth: 640,
    minHeight: 480,
    title: 'DeepSeek Harness Desktop',
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => { if (win) win.show() })
  win.on('closed', () => {
    win = null
    // The pet's lifetime is tied to the main window (it reports on the
    // harness the window owns), so closing the window also retires the pet.
    closePetWindow()
  })

  // Theme + audio injection for the remote web app (no-op on the local screen).
  injectMarisaTheme(win, cfg)

  // Open same-origin popups in-app; send external links to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (readyUrl && originOf(url) === originOf(readyUrl)) return { action: 'allow' }
    if (isHttp(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Keep the window inside the harness origin; external navigations open outside.
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return
    if (readyUrl && originOf(url) === originOf(readyUrl)) return
    event.preventDefault()
    if (isHttp(url)) void shell.openExternal(url)
  })

  void win.loadFile(loadingPath())
}

function startServer() {
  if (server) return

  if (!cfg.harnessRoot || !fs.existsSync(path.join(cfg.harnessRoot, 'package.json'))) {
    pushLog('[dsh-desktop] WARNING: harnessRoot does not look like a harness checkout (no package.json). Check config.json.')
  }

  server = new DshServer(cfg)
  server.on('log', (line) => pushLog(line))
  server.on('status', (s) => setStatus(s))
  server.on('ready', ({ url }) => {
    readyUrl = url
    pushLog('[dsh-desktop] ready at ' + url)
    showUrl(url)
  })
  server.on('exit', ({ wasReady }) => {
    if (wasReady) {
      pushLog('[dsh-desktop] the harness process exited unexpectedly.')
      readyUrl = null
      showLoading()
    }
    // Not ready: the loading screen is already visible and shows the error state.
  })
  void server.start()
}

function stopServer() {
  const s = server
  server = null
  if (s) s.stop()
}

async function restartServer() {
  stopServer()
  readyUrl = null
  setStatus({ state: 'starting' })
  await new Promise((resolve) => setTimeout(resolve, 800))
  startServer()
}

ipcMain.handle('dsh:get-state', () => ({
  status: lastStatus,
  url: readyUrl,
  logs: logs.slice(),
}))

ipcMain.on('dsh:restart', () => { void restartServer() })
ipcMain.on('dsh:quit', () => { app.quit() })
ipcMain.on('dsh:turn', (_event, turn) => { notifyTurn(turn) })

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()
    startServer()
    createPetWindow(cfg)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        createPetWindow(cfg)
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    closePetWindow()
    stopServer()
  })
}
