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

  /* Pet click: the pushed sound plays on click; a drag is NOT a click; and
   * pressing the transparent margin (off the image) is neither. */
  await win.webContents.executeJavaScript(`(function () {
    window.__audioPlayed = false
    window.Audio = function () { return { play: function () { window.__audioPlayed = true }, volume: 0 } }
  })()`)
  win.webContents.send('pet:sound', 'data:audio/mp3;base64,AAAA')
  const soundLanded = await waitFor(async () => {
    return win.webContents.executeJavaScript('window.__petSoundSet === true')
  }, 2000)
  if (!soundLanded) return fail('pet:sound did not reach the pet renderer')

  // The click zone hugs the fumo image — click its center.
  const center = await win.webContents.executeJavaScript(`(function () {
    var r = document.getElementById('fumo').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)

  await win.webContents.executeJavaScript(`(function () {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: ${center.x}, clientY: ${center.y}, screenX: ${center.x}, screenY: ${center.y} }))
    document.dispatchEvent(new MouseEvent('mouseup',   { clientX: ${center.x}, clientY: ${center.y}, screenX: ${center.x}, screenY: ${center.y} }))
  })()`)
  const clickCount = await win.webContents.executeJavaScript('window.__petClickCount || 0')
  const played = await win.webContents.executeJavaScript('window.__audioPlayed')
  if (clickCount !== 1) return fail('pet click did not register (count=' + clickCount + ')')
  if (!played) return fail('pet click did not play the custom sound')

  // A drag that starts on the image is a drag, not a click.
  await win.webContents.executeJavaScript(`(function () {
    document.dispatchEvent(new MouseEvent('mousedown',  { clientX: ${center.x}, clientY: ${center.y}, screenX: ${center.x}, screenY: ${center.y} }))
    document.dispatchEvent(new MouseEvent('mousemove',  { clientX: ${center.x + 30}, clientY: ${center.y + 30}, screenX: ${center.x + 30}, screenY: ${center.y + 30} }))
    document.dispatchEvent(new MouseEvent('mouseup',    { clientX: ${center.x + 30}, clientY: ${center.y + 30}, screenX: ${center.x + 30}, screenY: ${center.y + 30} }))
  })()`)
  const afterDrag = await win.webContents.executeJavaScript('window.__petClickCount || 0')
  if (afterDrag !== 1) return fail('drag was misclassified as a click (count=' + afterDrag + ')')

  // A press on the transparent margin (off the image) must NOT trigger a click.
  const offPt = await win.webContents.executeJavaScript(`(function () {
    var r = document.getElementById('fumo').getBoundingClientRect()
    return { x: Math.max(4, Math.round(r.left) - 20), y: Math.max(4, Math.round(r.top) - 20) }
  })()`)
  await win.webContents.executeJavaScript(`(function () {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: ${offPt.x}, clientY: ${offPt.y}, screenX: ${offPt.x}, screenY: ${offPt.y} }))
    document.dispatchEvent(new MouseEvent('mouseup',   { clientX: ${offPt.x}, clientY: ${offPt.y}, screenX: ${offPt.x}, screenY: ${offPt.y} }))
  })()`)
  const afterOff = await win.webContents.executeJavaScript('window.__petClickCount || 0')
  if (afterOff !== 1) return fail('off-image press triggered a click (count=' + afterOff + ')')

  /* Hit-area pass-through: the mouse is captured only while over the pet image
   * (or its UI elements); over the transparent margin it must stay ignored so
   * clicks reach the app underneath. `__petMouseCapture` is the renderer's
   * last hit-test verdict, set on every mousemove. */
  const hitOn = await win.webContents.executeJavaScript(`(function () {
    var r = document.getElementById('fumo').getBoundingClientRect()
    document.dispatchEvent(new MouseEvent('mousemove', {
      clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2),
    }))
    return window.__petMouseCapture
  })()`)
  if (hitOn !== true) return fail('mousemove on the image did not capture the mouse')

  const hitOff = await win.webContents.executeJavaScript(`(function () {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 300 }))
    return window.__petMouseCapture
  })()`)
  if (hitOff !== false) return fail('mousemove on the transparent margin did not pass through')

  console.log('pet-render: OK (fumo static / tokens pill / auth banner / completion notice / click plays sound / drag≠click / hit-area pass-through)')
  app.exit(0)
}).catch((err) => fail(err && err.message || String(err)))
