'use strict'

/**
 * General theme manager. Instead of forking the harness checkout, each theme
 * is a directory under assets/themes/<name>/ carrying a manifest (theme.json)
 * and a parameterized template (template.css). We stamp the live page with
 * body[data-ds-<name>], inject a stylesheet and the theme runtime — all from
 * Electron's webContents, so themes survive every harness rebuild unchanged.
 *
 * Asset portability: an http:// page cannot reach file:// assets, and relative
 * url() would resolve against the page origin. So asset slots referenced from
 * the template ({{backgroundImage}}, {{starImage}}, …) and every sound file in
 * the manifest are read here and inlined as data: URIs before injection. Drop
 * any licensed PNG/MP3 into a theme via the settings UI and it just works.
 */

const fs = require('node:fs')
const path = require('node:path')
const { userDataDir, isOverlay } = require('./userdata')

const THEMES_DIR = path.join(__dirname, '..', 'assets', 'themes')
const PET_IMAGE = path.join(__dirname, '..', 'assets', 'pet', 'marisa-fumo.png')
/** Built-in themes that cannot be deleted. */
const RESERVED_THEMES = ['marisa']

/*
 * Writable-data overlay. Packaged builds ship themes/assets/config inside the
 * read-only asar, so any user modification (custom themes, edited params,
 * replaced assets, pet image) is materialized under userData/<themes|pet>.
 * In dev the overlay IS the bundled tree, so behavior is unchanged.
 */
function userThemesRoot() {
  return isOverlay() ? path.join(userDataDir(), 'themes') : THEMES_DIR
}

/** Where the pet image is written (dev: the repo file; packaged: userData). */
function petImageWritePath() {
  return isOverlay() ? path.join(userDataDir(), 'pet', 'marisa-fumo.png') : PET_IMAGE
}

/** Effective pet image to display: userData copy when present, else bundled. */
function petImageFile() {
  if (isOverlay()) {
    const user = petImageWritePath()
    if (fs.existsSync(user)) return user
  }
  return PET_IMAGE
}

/*
 * Pet click sound — a GLOBAL desktop-shell asset (like the pet image), not
 * tied to the active theme. The user replaces it from the settings window; the
 * pet window plays it when clicked. Stored as assets/pet/pet-click.<ext> in
 * dev, userData/pet/pet-click.<ext> in packaged builds.
 */

function petClickSoundFile() {
  const dir = isOverlay() ? path.join(userDataDir(), 'pet') : path.join(__dirname, '..', 'assets', 'pet')
  try {
    const name = fs.readdirSync(dir).find((n) => /^pet-click\./i.test(n))
    return name ? path.join(dir, name) : null
  } catch (err) {
    return null
  }
}

/** Replace the (global) pet click sound and return its display info. */
function replacePetClickSound(srcPath) {
  const ext = path.extname(srcPath).toLowerCase() || '.mp3'
  const dest = isOverlay()
    ? path.join(userDataDir(), 'pet', 'pet-click' + ext)
    : path.join(__dirname, '..', 'assets', 'pet', 'pet-click' + ext)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(srcPath, dest)
  return { rel: 'assets/pet/' + path.basename(dest), dataUri: toDataUri(dest) }
}

const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
}

function toDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  const data = fs.readFileSync(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
}

function readText(abs) {
  try { return fs.readFileSync(abs, 'utf8') } catch (err) { return '' }
}

/* ── Manifest / theme discovery ──────────────────────────────────────── */

/**
 * Effective directory for a theme: the userData copy when it exists (it was
 * modified or created at runtime), else the bundled tree.
 */
function themeDir(name) {
  const user = path.join(userThemesRoot(), name)
  if (fs.existsSync(path.join(user, 'theme.json'))) return user
  return path.join(THEMES_DIR, name)
}

/** Copy a bundled theme into the userData overlay so writes have a target. */
function materializeTheme(name) {
  const user = path.join(userThemesRoot(), name)
  if (fs.existsSync(path.join(user, 'theme.json'))) return user
  const bundled = path.join(THEMES_DIR, name)
  fs.mkdirSync(user, { recursive: true })
  if (fs.existsSync(path.join(bundled, 'theme.json'))) {
    fs.cpSync(bundled, user, { recursive: true })
  }
  return user
}

function loadManifest(name) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(themeDir(name), 'theme.json'), 'utf8'))
    return raw && typeof raw === 'object' ? raw : null
  } catch (err) {
    return null
  }
}

function saveManifest(name, manifest) {
  const dir = materializeTheme(name)
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(manifest, null, 2) + '\n')
}

/** List installed themes (bundled + userData copies, user wins by name). */
function listThemes() {
  const themes = []
  const seen = new Set()
  for (const root of [userThemesRoot(), THEMES_DIR]) {
    let entries = []
    try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch (err) { continue }
    for (const d of entries) {
      if (!d.isDirectory() || seen.has(d.name)) continue
      const manifest = loadManifest(d.name)
      if (!manifest) continue
      seen.add(d.name)
      themes.push({ name: d.name, manifest })
    }
  }
  return themes.map((t) => ({ name: t.name, displayName: t.manifest.displayName || t.name, dir: themeDir(t.name) }))
}

/* ── CSS rendering ───────────────────────────────────────────────────── */

/** Inline one manifest asset slot as a data: URI url(); `none` when absent. */
function inlineAsset(dir, rel) {
  if (!rel) return 'none'
  const abs = path.join(dir, rel)
  return fs.existsSync(abs) ? `url("${toDataUri(abs)}")` : 'none'
}

/**
 * Render the theme's template.css: replace {{scope}} and every {{token}}
 * placeholder from manifest.params, inlining asset slots as data: URIs.
 * @param {object} manifest
 * @returns {string}
 */
function renderThemeCss(manifest) {
  if (!manifest) return ''
  const dir = themeDir(manifest.name)
  const css = readText(path.join(dir, manifest.template || 'template.css'))
  const params = manifest.params || {}
  const assets = manifest.assets || {}
  const props = assets.props || {}
  return css.replace(/\{\{([A-Za-z0-9_-]+)\}\}/g, (whole, key) => {
    switch (key) {
      case 'scope': return `data-ds-${manifest.name}`
      case 'backgroundImage': return inlineAsset(dir, assets.background)
      case 'starImage': return inlineAsset(dir, props.star)
      case 'hakkeroImage': return inlineAsset(dir, props.hakkero)
      case 'broomImage': return inlineAsset(dir, props.broom)
      case 'hatImage': return inlineAsset(dir, props.hat)
      case 'mushroomImage': return inlineAsset(dir, props.mushroom)
      default:
        return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole
    }
  }).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _quote, raw) => {
    const target = raw.trim()
    if (/^(data:|https?:|file:|#|\/)/.test(target)) return whole
    const abs = path.join(dir, target)
    return fs.existsSync(abs) ? `url("${toDataUri(abs)}")` : whole
  })
}

/** Sound map injected as window.__DSH_THEME_SOUNDS__ (data: URIs or null). */
function buildSoundMap(dir, sounds) {
  const map = {}
  for (const name of Object.keys(sounds || {})) {
    const rel = sounds[name]
    map[name] = rel && fs.existsSync(path.join(dir, rel)) ? toDataUri(path.join(dir, rel)) : null
  }
  return map
}

/** Theme identity + accent colors consumed by inject.js. */
function themeConfigFor(manifest, name) {
  const p = (manifest && manifest.params) || {}
  return {
    name: name || (manifest && manifest.name) || 'marisa',
    displayName: (manifest && manifest.displayName) || name || 'marisa',
    accent: p.accent || '#f6b93f',
    accentSoft: p.gradientStart || '#ffd166',
    accentInk: p.labelOnAccent || '#241a08',
  }
}

/** Script payload: theme config + sound map + the theme runtime. */
function buildPayload(manifest, name) {
  const js = readText(path.join(themeDir(name), 'inject.js'))
  const sounds = buildSoundMap(themeDir(name), manifest && manifest.assets && manifest.assets.sounds)
  const cfg = themeConfigFor(manifest, name)
  return `window.__DSH_THEME_CONFIG__ = ${JSON.stringify(cfg)};\n` +
    `window.__DSH_THEME_SOUNDS__ = ${JSON.stringify(sounds)};\n${js}`
}

/* ── Injection into a live window ────────────────────────────────────── */

/** Latest insertCSS() key per window, for live replacement without reload. */
const cssKeys = new WeakMap()

async function applyCss(win, css) {
  const wc = win.webContents
  const oldKey = cssKeys.get(win)
  if (oldKey) {
    try { await wc.removeInsertedCSS(oldKey) } catch (err) { /* already gone */ }
  }
  const key = await wc.insertCSS(css)
  cssKeys.set(win, key)
  return key
}

function resolveCfg(cfgOrGetter) {
  return typeof cfgOrGetter === 'function' ? cfgOrGetter() : (cfgOrGetter || {})
}

/**
 * Inject the active theme into an http(s) page in `win`.
 * @param {import('electron').BrowserWindow} win
 * @param {object | (() => object)} cfgOrGetter merged config (or live getter)
 * @param {{rerunJs?: boolean}} [opts] rerunJs=false only swaps the data-ds-*
 *   attribute and the stylesheet (for live apply after a save).
 */
async function injectToPage(win, cfgOrGetter, { rerunJs = true } = {}) {
  const cfg = resolveCfg(cfgOrGetter)
  const themeCfg = (cfg && cfg.theme) || {}
  if (themeCfg.enabled === false) return
  const name = themeCfg.name || 'marisa'
  const manifest = loadManifest(name)
  const css = renderThemeCss(manifest)
  const url = win.webContents.getURL()
  if (!url || !/^https?:/i.test(url)) return

  if (rerunJs) {
    try {
      await win.webContents.executeJavaScript(buildPayload(manifest, name), true)
    } catch (err) {
      console.error('[theme] inject script failed: ' + err.message)
    }
  } else {
    const swap = `(function(){var b=document.body;if(!b)return;` +
      `for(var i=b.attributes.length-1;i>=0;i--){var a=b.attributes[i];` +
      `if(/^data-ds-/.test(a.name))b.removeAttribute(a.name);}` +
      `b.setAttribute('data-ds-${name}','');})()`
    try { await win.webContents.executeJavaScript(swap, true) } catch (err) { /* noop */ }
    // Live theme switch: refresh the sound map without re-running the
    // (guarded) runtime — inject.js exposes __DSH_DESKTOP__.setSounds().
    const sounds = buildSoundMap(themeDir(name), manifest && manifest.assets && manifest.assets.sounds)
    if (Object.keys(sounds).length) {
      try {
        await win.webContents.executeJavaScript(
          `window.__DSH_DESKTOP__ && window.__DSH_DESKTOP__.setSounds && ` +
          `window.__DSH_DESKTOP__.setSounds(${JSON.stringify(sounds)})`, true)
      } catch (err) { /* noop */ }
    }
  }
  if (css) {
    try { await applyCss(win, css) } catch (err) {
      console.error('[theme] insertCSS failed: ' + err.message)
    }
  }
}

/**
 * Attach theme + audio injection to a BrowserWindow. Fires on every
 * `dom-ready` of an http(s) page (the remote dsh web URL), never on the local
 * loading screen.
 * @param {import('electron').BrowserWindow} win
 * @param {object | (() => object)} cfgOrGetter
 * @returns {() => void} disposer removing the listener.
 */
function injectTheme(win, cfgOrGetter) {
  if (!win || !win.webContents) return () => {}
  const onDomReady = () => {
    try { return injectToPage(win, cfgOrGetter) } catch (err) {
      console.error('[theme] inject failed: ' + err.message)
      return Promise.resolve()
    }
  }
  win.webContents.on('dom-ready', onDomReady)
  return () => { win.webContents.removeListener('dom-ready', onDomReady) }
}

/** Re-apply the active theme to an already-loaded page (no page reload). */
function reapplyTheme(win, cfgOrGetter) {
  if (!win || !win.webContents) return Promise.resolve()
  return injectToPage(win, cfgOrGetter, { rerunJs: false })
}

/* ── Theme management (create / delete / assets) ─────────────────────── */

function createTheme(name, displayName) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(name)) {
    throw new Error('主题名只能包含字母、数字、-、_，且不能以数字开头（1-32 字符）')
  }
  if (!fs.existsSync(path.join(THEMES_DIR, 'marisa'))) throw new Error('缺少内置模板 marisa，无法创建主题')
  const dest = path.join(userThemesRoot(), name)
  if (fs.existsSync(dest)) throw new Error('主题已存在：' + name)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(path.join(THEMES_DIR, 'marisa'), dest, { recursive: true })
  const manifest = loadManifest(name)
  manifest.name = name
  manifest.displayName = displayName || name
  saveManifest(name, manifest)
  return { name, displayName: manifest.displayName }
}

function removeTheme(name) {
  if (RESERVED_THEMES.includes(name)) throw new Error('内置主题不可删除')
  const dir = path.join(userThemesRoot(), name)
  if (!fs.existsSync(dir)) throw new Error('主题不存在：' + name)
  fs.rmSync(dir, { recursive: true, force: true })
}

/** Copy a picked file into a theme subdir under a stable slot filename. */
function copyInto(name, subdir, base, srcPath) {
  const dir = path.join(themeDir(name), subdir)
  fs.mkdirSync(dir, { recursive: true })
  const ext = path.extname(srcPath).toLowerCase() || '.bin'
  let stale = []
  try { stale = fs.readdirSync(dir).filter((f) => path.basename(f, path.extname(f)) === base) } catch (err) { /* noop */ }
  for (const f of stale) {
    try { fs.unlinkSync(path.join(dir, f)) } catch (err) { /* noop */ }
  }
  const dest = path.join(dir, base + ext)
  fs.copyFileSync(srcPath, dest)
  return subdir + '/' + base + ext
}

/**
 * Replace one asset slot (background / props.<x> / sounds.<x>), copying the
 * picked file into the theme dir and persisting the manifest.
 * @returns {{slot: string, rel: string, dataUri: string}}
 */
function replaceAsset(name, slot, srcPath) {
  materializeTheme(name) // give the theme a writable home first (packaged builds)
  const manifest = loadManifest(name)
  if (!manifest) throw new Error('主题不存在：' + name)
  const assets = manifest.assets || (manifest.assets = {})
  let rel = null
  if (slot === 'background') {
    rel = copyInto(name, 'images', 'background', srcPath)
    assets.background = rel
  } else if (slot.startsWith('props.')) {
    const key = slot.slice('props.'.length)
    assets.props = assets.props || {}
    rel = copyInto(name, 'images', key, srcPath)
    assets.props[key] = rel
  } else if (slot.startsWith('sounds.')) {
    const key = slot.slice('sounds.'.length)
    assets.sounds = assets.sounds || {}
    rel = copyInto(name, 'sounds', key, srcPath)
    assets.sounds[key] = rel
  } else {
    throw new Error('未知素材槽位：' + slot)
  }
  saveManifest(name, manifest)
  return { slot, rel, dataUri: toDataUri(path.join(themeDir(name), rel)) }
}

/** Replace the (global) pet image and return its display info. */
function replacePetImage(srcPath) {
  const dest = petImageWritePath()
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(srcPath, dest)
  return { rel: 'assets/pet/marisa-fumo.png', dataUri: toDataUri(dest) }
}

/** Describe a theme's asset slots for the settings UI (with preview URIs). */
function describeAssets(name, manifest) {
  const dir = themeDir(name)
  const assets = manifest.assets || {}
  const props = assets.props || {}
  const sounds = assets.sounds || {}
  const template = readText(path.join(dir, manifest.template || 'template.css'))
  // Ignore placeholders inside CSS comments (documentation / disabled rules).
  const activeCss = template.replace(/\/\*[\s\S]*?\*\//g, '')
  const referenced = (placeholder) => activeCss.includes('{{' + placeholder + '}}')
  const list = []
  const push = (slot, label, kind, rel, placeholder) => {
    const abs = rel ? path.join(dir, rel) : null
    list.push({
      slot, label, kind,
      rel: rel || '',
      used: kind !== 'image' || referenced(placeholder),
      dataUri: abs && fs.existsSync(abs) ? toDataUri(abs) : null,
    })
  }
  push('background', '背景图', 'image', assets.background, 'backgroundImage')
  for (const [key, rel] of Object.entries(props)) {
    push('props.' + key, '道具图 · ' + key, 'image', rel, key + 'Image')
  }
  for (const [key, rel] of Object.entries(sounds)) {
    push('sounds.' + key, '音效 · ' + key, 'sound', rel, '')
  }
  const pet = petImageFile()
  if (fs.existsSync(pet)) {
    list.push({
      slot: 'pet', label: '宠物形象', kind: 'image', rel: 'assets/pet/marisa-fumo.png',
      used: true, dataUri: toDataUri(pet),
    })
  }
  // Global pet click sound (whole-app feature, not theme-scoped).
  const snd = petClickSoundFile()
  list.push({
    slot: 'pet-sound', label: '宠物点击音效', kind: 'sound',
    rel: snd ? 'assets/pet/' + path.basename(snd) : '',
    used: true, dataUri: snd ? toDataUri(snd) : null,
  })
  return list
}

module.exports = {
  THEMES_DIR,
  THEME_DIR: THEMES_DIR, // legacy alias
  PET_IMAGE,
  petImageFile,
  petClickSoundFile,
  replacePetClickSound,
  RESERVED_THEMES,
  toDataUri,
  themeDir,
  loadManifest,
  saveManifest,
  listThemes,
  renderThemeCss,
  buildSoundMap,
  themeConfigFor,
  buildPayload,
  injectTheme,
  reapplyTheme,
  createTheme,
  removeTheme,
  replaceAsset,
  replacePetImage,
  describeAssets,
  // Legacy alias used by tests / older call sites.
  injectMarisaTheme: injectTheme,
}
