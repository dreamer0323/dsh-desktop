'use strict'

/**
 * Headless smoke test for src/theme.js: drives injectMarisaTheme against a
 * fake webContents and asserts that (1) the injected JS payload carries the
 * sound map, and (2) the CSS has every relative url(...) inlined as a data:
 * URI (so an http page can use it without a server). Runs without Electron —
 * theme.js only depends on fs/path.
 */

const assert = require('node:assert')
const { injectMarisaTheme } = require('../src/theme')

const calls = { js: null, css: null, domReady: null }

const fakeWin = {
  webContents: {
    on(ev, fn) { if (ev === 'dom-ready') calls.domReady = fn },
    getURL() { return 'http://127.0.0.1:3080/' },
    async executeJavaScript(code) { calls.js = code },
    async insertCSS(css) { calls.css = css; return 'key' },
  },
}

injectMarisaTheme(fakeWin, { theme: { enabled: true } })
assert.strictEqual(typeof calls.domReady, 'function', 'dom-ready listener registered')

// Trigger the injection path synchronously via the captured handler.
const p = calls.domReady()
Promise.resolve(p).then(() => {
  assert.ok(calls.js, 'injected JS payload present')
  assert.ok(calls.js.includes('__DSH_THEME_SOUNDS__'), 'sound map injected')
  assert.ok(calls.css, 'injected CSS present')
  assert.ok(calls.css.includes('data:image/jpeg;base64,'), 'background url inlined as data URI (jpeg)')
  assert.ok(!/url\(\s*["']?images\//.test(calls.css), 'no unresolved relative image urls remain')
  console.log('theme-smoke: OK (js=%d bytes, css=%d bytes)', calls.js.length, calls.css.length)
}).catch((err) => {
  console.error('theme-smoke: FAIL', err)
  process.exitCode = 1
})
