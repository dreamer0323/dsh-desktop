'use strict'

/**
 * Marisa theme injector. The desktop shell owns the theme: instead of forking
 * the harness checkout, we stamp the live page with body[data-ds-marisa],
 * inject a stylesheet, and run the audio runtime — all from Electron's
 * webContents, so the theme survives every harness rebuild unchanged.
 *
 * Asset portability: an http:// page cannot reach file:// assets, and relative
 * url() would resolve against the page origin. So every url(...) in theme.css
 * and every sound file in the SOUND map is read here and inlined as a data:
 * URI before injection. Drop a PNG/MP3 into assets/themes/marisa/ and it just
 * works.
 */

const fs = require('node:fs')
const path = require('node:path')

const THEME_DIR = path.join(__dirname, '..', 'assets', 'themes', 'marisa')

const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
}

function toDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  const data = fs.readFileSync(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
}

/** Inline every relative url(...) in a CSS string as a data: URI. */
function resolveCssUrls(css) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _quote, raw) => {
    const target = raw.trim()
    if (/^(data:|https?:|file:|#|\/)/.test(target)) return whole
    const abs = path.resolve(THEME_DIR, target)
    return fs.existsSync(abs) ? `url("${toDataUri(abs)}")` : whole
  })
}

/** Read a theme asset as text; returns '' when absent (fail soft). */
function readAsset(rel) {
  const abs = path.join(THEME_DIR, rel)
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch (err) {
    console.error('[theme] missing asset ' + rel + ': ' + err.message)
    return ''
  }
}

/** Sound map injected as window.__DSH_THEME_SOUNDS__ (data: URIs or null). */
function buildSoundMap() {
  const sounds = { click: null, hover: null, complete: null, error: null }
  const dir = path.join(THEME_DIR, 'sounds')
  for (const name of Object.keys(sounds)) {
    for (const ext of ['.mp3', '.wav', '.ogg', '.m4a']) {
      const candidate = path.join(dir, name + ext)
      if (fs.existsSync(candidate)) {
        sounds[name] = toDataUri(candidate)
        break
      }
    }
  }
  return sounds
}

/**
 * Attach theme + audio injection to a BrowserWindow. The injector fires on
 * every `dom-ready` of an http(s) page (the remote dsh web URL), never on the
 * local loading screen.
 * @param {import('electron').BrowserWindow} win
 * @param {object} cfg merged config (may carry `theme` overrides)
 * @returns {() => void} disposer removing the listener.
 */
function injectMarisaTheme(win, cfg) {
  if (!win || !win.webContents) return () => {}
  const themeCfg = (cfg && cfg.theme) || {}
  if (themeCfg.enabled === false) return () => {}

  const css = resolveCssUrls(readAsset('theme.css'))
  const js = readAsset('inject.js')
  const soundsJson = JSON.stringify(buildSoundMap())
  // The sound map must exist before inject.js reads it.
  const soundPre = `window.__DSH_THEME_SOUNDS__ = ${soundsJson};`
  const payload = `${soundPre}\n${js}`

  const onDomReady = () => {
    const url = win.webContents.getURL()
    if (!url || !/^https?:/i.test(url)) return Promise.resolve()
    // Order matters: stamp the attribute + run audio runtime, then apply CSS.
    return (async () => {
      try {
        await win.webContents.executeJavaScript(payload, true)
      } catch (err) {
        console.error('[theme] inject script failed: ' + err.message)
      }
      if (css) {
        try {
          await win.webContents.insertCSS(css)
        } catch (err) {
          console.error('[theme] insertCSS failed: ' + err.message)
        }
      }
    })()
  }

  win.webContents.on('dom-ready', onDomReady)
  return () => { win.webContents.removeListener('dom-ready', onDomReady) }
}

module.exports = { injectMarisaTheme, THEME_DIR }
