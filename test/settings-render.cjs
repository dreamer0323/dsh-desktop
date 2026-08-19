'use strict'

/**
 * Electron check for the theme settings window: loads ui/settings.html with
 * the real preload-settings.js and verifies the IPC surface + initial render.
 * Does NOT start the harness server. Launched by test/run-settings-render.cjs.
 */

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const themeApi = require('../src/theme')
const { expandParams, FIELD_DEFS, DEFAULT_FRIENDLY, FRIENDLY_KEYS } = require('../src/theme-params')
const { loadConfig } = require('../src/config')
const cfg = loadConfig()

// Register the subset of dsh:theme:* handlers the settings window needs.
ipcMain.handle('dsh:theme:schema', () => ({
  fields: FIELD_DEFS,
  defaults: DEFAULT_FRIENDLY,
  friendlyKeys: [...FRIENDLY_KEYS],
}))
ipcMain.handle('dsh:theme:expand', (_e, f) => expandParams(f))
ipcMain.handle('dsh:theme:list', () => themeApi.listThemes().map((t) => ({
  name: t.name,
  displayName: t.displayName,
  active: t.name === cfg.theme.name,
})))
ipcMain.handle('dsh:theme:read', (_e, name) => {
  const m = themeApi.loadManifest(name)
  if (!m) return null
  return {
    name: m.name,
    displayName: m.displayName || m.name,
    params: m.params || {},
    assets: themeApi.describeAssets(name, m),
    active: name === cfg.theme.name,
  }
})

app.whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 980,
      height: 700,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'src', 'preload-settings.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    await win.loadFile(path.join(__dirname, '..', 'ui', 'settings.html'))
    await new Promise((resolve) => setTimeout(resolve, 900))
    const result = await win.webContents.executeJavaScript(`(async () => {
      var cards = document.querySelectorAll('.theme-card').length
      var head = document.querySelector('.editor-head h2') ? document.querySelector('.editor-head h2').textContent : null
      var fields = document.querySelectorAll('#paramForm .field').length
      var assets = document.querySelectorAll('.asset-card').length
      var jsonLen = document.getElementById('paramsJson') ? document.getElementById('paramsJson').value.length : 0
      var list = await window.dshTheme.list()
      return {
        cards: cards, head: head, fields: fields, assets: assets,
        jsonLen: jsonLen, listCount: list.length,
        active: list.filter(function (t) { return t.active }).map(function (t) { return t.name })[0],
      }
    })()`)
    console.log('SETTINGS-E2E ' + JSON.stringify(result))
    app.exit(result.cards >= 1 && result.head && result.fields >= 1 && result.assets >= 1 ? 0 : 1)
  })
  .catch((err) => {
    console.error('SETTINGS-E2E FAIL', err)
    app.exit(1)
  })
