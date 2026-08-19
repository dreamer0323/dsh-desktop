'use strict'

/**
 * Headless smoke test for src/theme.js: drives injectTheme against a fake
 * webContents and asserts that (1) the injected JS payload carries the theme
 * config + sound map, and (2) the CSS has every asset inlined as a data: URI
 * with no leftover {{placeholders}} (so an http page can use it without a
 * server). Runs without Electron — theme.js only depends on fs/path.
 */

const assert = require('node:assert')
const themeApi = require('../src/theme')
const { expandParams, DEFAULT_FRIENDLY } = require('../src/theme-params')

const calls = { js: [], css: null, domReady: null, removed: [] }

const fakeWin = {
  webContents: {
    on(ev, fn) { if (ev === 'dom-ready') calls.domReady = fn },
    getURL() { return 'http://127.0.0.1:3080/' },
    async executeJavaScript(code) { calls.js.push(code) },
    async insertCSS(css) { calls.css = css; return 'key-1' },
    async removeInsertedCSS(key) { calls.removed.push(key) },
  },
}

themeApi.injectTheme(fakeWin, { theme: { enabled: true } })
assert.strictEqual(typeof calls.domReady, 'function', 'dom-ready listener registered')

// Trigger the injection path synchronously via the captured handler.
const p = calls.domReady()
Promise.resolve(p).then(() => {
  assert.ok(calls.js.length, 'injected JS payload present')
  assert.ok(calls.js.some((c) => c.includes('__DSH_THEME_CONFIG__')), 'theme config injected')
  assert.ok(calls.js.some((c) => c.includes('__DSH_THEME_SOUNDS__')), 'sound map injected')
  assert.ok(calls.css, 'injected CSS present')
  assert.ok(calls.css.includes('body[data-ds-marisa]'), 'theme scoped under data-ds-marisa')
  assert.ok(calls.css.includes('data:image/webp;base64,'), 'background url inlined as data URI (webp)')
  assert.ok(!/\{\{[A-Za-z0-9_-]+\}\}/.test(calls.css), 'no leftover {{placeholders}} in rendered css')
  assert.ok(!/url\(\s*["']?images\//.test(calls.css), 'no unresolved relative image urls remain')

  // Live apply path: reapplyTheme swaps the stylesheet (remove old key), re-stamps
  // the body attribute, and refreshes the sound map — WITHOUT re-running the full runtime.
  calls.js = []
  calls.removed = []
  fakeWin.webContents.insertCSS = async () => 'key-2'
  return themeApi.reapplyTheme(fakeWin, { theme: { enabled: true } }).then(() => {
    assert.deepStrictEqual(calls.removed, ['key-1'], 'old stylesheet key removed on live re-apply')
    assert.strictEqual(calls.css.includes('body[data-ds-marisa]'), true, 're-applied css re-rendered')
    assert.ok(!calls.js.some((c) => c.includes('__DSH_THEME_CONFIG__')), 're-apply does not re-run the full runtime')
    assert.ok(calls.js.some((c) => c.includes('data-ds-marisa')), 're-apply re-stamps the theme attribute')
    assert.ok(calls.js.some((c) => c.includes('setSounds')), 're-apply refreshes the sound map')
    return true
  })
}).then(() => {
  // Param expansion with defaults must reproduce the marisa manifest tokens.
  const manifest = themeApi.loadManifest('marisa')
  assert.ok(manifest, 'marisa manifest loads')
  const expanded = expandParams(DEFAULT_FRIENDLY)
  for (const [key, value] of Object.entries(manifest.params)) {
    assert.strictEqual(String(expanded[key]), String(value), 'default param ' + key + ' matches manifest')
  }
  console.log('theme-smoke: OK (inject + live-apply + %d params verified)', Object.keys(manifest.params).length)
}).catch((err) => {
  console.error('theme-smoke: FAIL', err)
  process.exitCode = 1
})
