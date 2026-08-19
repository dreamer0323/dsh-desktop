'use strict'

const { app, BrowserWindow, ipcMain, shell, Notification, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { loadConfig, writeConfig } = require('./config')
const { DshServer } = require('./server')
const themeApi = require('./theme')
const { expandParams, FIELD_DEFS, DEFAULT_FRIENDLY, FRIENDLY_KEYS } = require('./theme-params')
const { createPetWindow, closePetWindow, notifyTurn, notifyPetEvent, setPetVisible, getPetVisible, reloadPetWindow } = require('./pet')

let cfg = loadConfig()

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
  // A getter keeps the injector reading the live config after theme switches.
  themeApi.injectTheme(win, () => cfg)

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

/** General pet events from the injected theme runtime (tokens / auth). */
ipcMain.on('dsh:pet', (_event, payload) => {
  notifyPetEvent(payload)
  // A pending approval blocks the agent — raise an OS notification so the
  // user notices even if the window is in the background.
  if (payload && payload.kind === 'auth' && payload.pending) {
    showSystemNotify('魔理沙 · 需要确认', (payload.reason || 'agent 请求授权') + '，请回桌面窗口确认')
  }
})

function showSystemNotify(title, body) {
  if (!Notification.isSupported()) return
  try {
    const n = new Notification({ title, body, silent: true })
    n.on('click', () => {
      if (win && !win.isDestroyed()) { win.show(); win.focus() }
    })
    n.show()
  } catch (err) { /* ignore */ }
}

/** Push current pet visibility to the harness page (sidebar toggle state). */
function broadcastPetState() {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('dsh:pet-state-push', { visible: getPetVisible() }) } catch (err) { /* ignore */ }
  }
}

/** Sidebar toggle: show / hide the pet window. */
ipcMain.on('dsh:pet-toggle', () => {
  setPetVisible(!getPetVisible())
  broadcastPetState()
})
ipcMain.handle('dsh:pet-state', () => ({ visible: getPetVisible() }))

/* ══ Theme settings window + IPC ═══════════════════════════════════════ */

let settingsWin = null

function openThemeSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 760,
    minHeight: 520,
    title: '主题设置',
    backgroundColor: '#12121a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  settingsWin.on('closed', () => { settingsWin = null })
  void settingsWin.loadFile(path.join(__dirname, '..', 'ui', 'settings.html'))
}
ipcMain.on('dsh:open-theme-settings', openThemeSettings)

const IMAGE_FILTERS = [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'] }]
const SOUND_FILTERS = [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }]

async function pickFile(filters) {
  const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : (win || undefined)
  const res = await dialog.showOpenDialog(parent, { properties: ['openFile'], filters })
  if (res.canceled || !res.filePaths[0]) return null
  return res.filePaths[0]
}

function broadcastThemeState() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    try { settingsWin.webContents.send('dsh:theme-state', { active: cfg.theme.name }) } catch (err) { /* ignore */ }
  }
}

function writeThemeConfig(patch) {
  const current = (cfg && cfg.theme) || {}
  writeConfig({ theme: { ...current, ...patch } })
}

/** Re-apply the active theme to the loaded page (no reload, no state loss). */
async function applyTheme() {
  if (win && !win.isDestroyed()) await themeApi.reapplyTheme(win, () => cfg)
}

ipcMain.handle('dsh:theme:schema', () => ({
  fields: FIELD_DEFS,
  defaults: DEFAULT_FRIENDLY,
  friendlyKeys: [...FRIENDLY_KEYS],
}))
ipcMain.handle('dsh:theme:defaults', () => expandParams(DEFAULT_FRIENDLY))
ipcMain.handle('dsh:theme:expand', (_e, friendly) => expandParams(friendly))

ipcMain.handle('dsh:theme:list', () => themeApi.listThemes().map((t) => ({
  name: t.name,
  displayName: t.displayName,
  active: t.name === cfg.theme.name,
})))

ipcMain.handle('dsh:theme:read', (_e, name) => {
  const manifest = themeApi.loadManifest(name)
  if (!manifest) return null
  return {
    name: manifest.name,
    displayName: manifest.displayName || manifest.name,
    params: manifest.params || {},
    assets: themeApi.describeAssets(name, manifest),
    active: name === cfg.theme.name,
  }
})

ipcMain.handle('dsh:theme:create', (_e, { name, displayName }) => {
  return themeApi.createTheme(name, displayName)
})

ipcMain.handle('dsh:theme:set-active', async (_e, name) => {
  if (!themeApi.loadManifest(name)) throw new Error('主题不存在：' + name)
  writeThemeConfig({ name })
  cfg = loadConfig()
  await applyTheme()
  broadcastThemeState()
  return cfg.theme.name
})

ipcMain.handle('dsh:theme:save', async (_e, { name, displayName, params }) => {
  const manifest = themeApi.loadManifest(name)
  if (!manifest) throw new Error('主题不存在：' + name)
  manifest.displayName = displayName || manifest.displayName || name
  manifest.params = params || {}
  themeApi.saveManifest(name, manifest)
  if (name === cfg.theme.name) await applyTheme()
  return true
})

ipcMain.handle('dsh:theme:apply', async () => { await applyTheme(); return true })

ipcMain.handle('dsh:theme:pick-asset', async (_e, { name, slot, kind }) => {
  const src = await pickFile(kind === 'sound' ? SOUND_FILTERS : IMAGE_FILTERS)
  if (!src) return null
  const res = themeApi.replaceAsset(name, slot, src)
  if (name === cfg.theme.name) await applyTheme()
  return res
})

ipcMain.handle('dsh:theme:pick-pet', async () => {
  const src = await pickFile(IMAGE_FILTERS)
  if (!src) return null
  const res = themeApi.replacePetImage(src)
  reloadPetWindow()
  return res
})

ipcMain.handle('dsh:theme:remove', (_e, name) => {
  if (name === cfg.theme.name) throw new Error('当前生效的主题不可删除，请先切换到其他主题')
  themeApi.removeTheme(name)
  return true
})

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
