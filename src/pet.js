'use strict'

/**
 * Desktop pet window manager (main process). Owns the transparent,
 * always-on-top companion window, positions it bottom-right, and streams
 * system stats into it. Turn-complete reminders are forwarded through
 * `notifyTurn` from the main window (phase 4) via the `pet:turn` channel.
 */

const { BrowserWindow, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { StatsMonitor } = require('./stats')
const themeApi = require('./theme')

let petWin = null
let statsTimer = null

function petPath() {
  return path.join(__dirname, '..', 'ui', 'pet.html')
}

/** Effective pet image as a data: URI (userData replacement, else bundled). */
function petImageUri() {
  try {
    const f = themeApi.petImageFile()
    return fs.existsSync(f) ? themeApi.toDataUri(f) : null
  } catch (err) {
    return null
  }
}

function createPetWindow(cfg) {
  const petCfg = (cfg && cfg.pet) || {}
  if (petCfg.enabled === false) return null
  if (petWin && !petWin.isDestroyed()) {
    petWin.show()
    return petWin
  }

  const width = petCfg.width || 240
  const height = petCfg.height || 280

  petWin = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'Marisa Pet',
    webPreferences: {
      preload: path.join(__dirname, 'preload-pet.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  petWin.setAlwaysOnTop(true, 'floating')
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  petWin.once('ready-to-show', () => { if (petWin) petWin.show() })
  petWin.on('closed', () => {
    petWin = null
    stopStats()
  })

  void petWin.loadFile(petPath())

  // Hand the feature toggles + effective pet image to the window. Uses `.on`
  // so a reload (after a pet-image replacement) re-pushes the fresh image.
  petWin.webContents.on('did-finish-load', () => {
    if (petWin && !petWin.isDestroyed()) {
      try {
        petWin.webContents.send('pet:image', petImageUri())
        petWin.webContents.send('pet:config', {
          tokens: !!(petCfg.tokens && petCfg.tokens.enabled),
          notify: !!(petCfg.notify && petCfg.notify.enabled),
        })
      } catch (err) { /* ignore */ }
    }
  })

  // Anchor to the primary display's bottom-right corner with a small margin.
  const wa = screen.getPrimaryDisplay().workArea
  const x = wa.x + wa.width - width - 16
  const y = wa.y + wa.height - height - 16
  petWin.setPosition(x, y)

  startStats(petCfg)
  return petWin
}

function startStats(petCfg) {
  if (statsTimer) return
  const monitor = new StatsMonitor()
  const interval = petCfg.statsIntervalMs || 2000
  const send = () => {
    if (petWin && !petWin.isDestroyed()) {
      try { petWin.webContents.send('pet:stats', monitor.read()) } catch (err) { /* window closing */ }
    }
  }
  send()
  statsTimer = setInterval(send, interval)
  if (statsTimer.unref) statsTimer.unref()
}

function stopStats() {
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
}

/** Forward a turn-lifecycle event to the pet (idempotent when absent). */
function notifyTurn(event) {
  if (petWin && !petWin.isDestroyed()) {
    try { petWin.webContents.send('pet:turn', event) } catch (err) { /* ignore */ }
  }
}

/** Forward a generic pet event (tokens / authorization / chat reply). */
function notifyPetEvent(event) {
  if (petWin && !petWin.isDestroyed()) {
    try { petWin.webContents.send('pet:event', event) } catch (err) { /* ignore */ }
  }
}

function closePetWindow() {
  if (petWin && !petWin.isDestroyed()) petWin.destroy()
  petWin = null
  stopStats()
}

/** Show / hide the pet window (sidebar toggle). */
function setPetVisible(visible) {
  if (!petWin || petWin.isDestroyed()) return false
  if (visible) {
    petWin.show()
    petWin.focus()
  } else {
    petWin.hide()
  }
  return true
}

/** Reload the pet window so a newly replaced pet image takes effect. */
function reloadPetWindow() {
  if (petWin && !petWin.isDestroyed()) {
    try { petWin.webContents.reload() } catch (err) { /* ignore */ }
  }
}

/** Current pet visibility (true when the window exists and is shown). */
function getPetVisible() {
  return !!petWin && !petWin.isDestroyed() && petWin.isVisible()
}

module.exports = {
  createPetWindow, closePetWindow, notifyTurn, notifyPetEvent,
  setPetVisible, getPetVisible, reloadPetWindow, getPetWindow: () => petWin,
}
