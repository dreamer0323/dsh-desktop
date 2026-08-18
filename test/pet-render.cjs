'use strict'

/**
 * Electron integration test for the pet window layer (no harness, no chat, no
 * voice): loads ui/pet.html with the real preload-pet.js, pushes config/stats/
 * tokens/auth/turn events over the bridge, and asserts the rendered DOM reacts.
 * Run: node test/run-pet-render.cjs
 */

const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const assert = require('node:assert')

app.disableHardwareAcceleration()

let failed = false
function fail(msg) { failed = true; console.error('pet-render FAIL:', msg); app.exit(1) }

const root = path.join(__dirname, '..')

async function waitFor(check, ms, step) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, step || 60))
  }
  return false
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 300,
    height: 400,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(root, 'src', 'preload-pet.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.webContents.on('console-message', (_e, _level, msg) => {
    if (/error|uncaught/i.test(msg)) fail('renderer console: ' + msg)
  })

  await win.loadFile(path.join(root, 'ui', 'pet.html'))

  win.webContents.send('pet:config', { tokens: true, notify: true })
  win.webContents.send('pet:stats', { mem: 42, cpu: 13 })
  win.webContents.send('pet:event', { kind: 'tokens', input: 12345, output: 678 })
  win.webContents.send('pet:event', { kind: 'auth', pending: true, reason: '工具 Bash 请求执行' })

  const ready = await waitFor(async () => {
    return win.webContents.executeJavaScript(
      'var f = document.getElementById("fumo"); f && f.naturalWidth > 0 && !!document.querySelector(".auth-banner")')
  }, 4000)
  if (!ready) return fail('fumo image + auth banner did not appear')

  const state = await win.webContents.executeJavaScript(`({
    token: document.getElementById('tokenPill').textContent,
    stats: document.getElementById('statsPill').textContent,
    auth: document.querySelector('.auth-banner .auth-label').textContent,
  })`)
  try {
    assert.strictEqual(state.token, 'tokens 输入 12.3K · 输出 678', 'token pill text')
    assert.strictEqual(state.stats, '内存 42% · CPU 13%', 'stats pill text')
    assert.ok(state.auth.includes('工具 Bash 请求执行'), 'auth label shows reason')
  } catch (err) { return fail(err.message) }

  // Clear auth via the banner close button.
  await win.webContents.executeJavaScript('document.querySelector(".auth-close").click()')
  await new Promise((r) => setTimeout(r, 120))
  if (!(await win.webContents.executeJavaScript('!document.querySelector(".auth-banner")'))) {
    return fail('auth banner did not dismiss')
  }

  // Turn completion drives the "回答完毕" notice.
  win.webContents.send('pet:turn', { state: 'done', elapsedMs: 1234 })
  const notice = await waitFor(async () => {
    const t = await win.webContents.executeJavaScript('document.getElementById("bubbleText").textContent')
    return /回答完毕/.test(t)
  }, 3000)
  if (!notice) return fail('completion notice not shown')

  console.log('pet-render: OK (fumo static / tokens pill / auth banner / completion notice)')
  app.exit(0)
}).catch((err) => fail(err && err.message || String(err)))
