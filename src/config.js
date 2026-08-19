'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { userDataDir } = require('./userdata')

/** Root of this desktop wrapper project (one level above src/). */
function projectRoot() {
  return path.resolve(__dirname, '..')
}

/**
 * config.json the user actually edits / we write back to. Packaged builds run
 * from inside the read-only asar, so writes go to userData; dev writes the
 * repo copy (identical paths).
 */
function configFile() {
  return path.join(userDataDir(), 'config.json')
}

const DEFAULTS = {
  // The DeepSeek Harness repository checkout the wrapper launches. Kept empty on
  // purpose: resolveHarness() (src/detect.js) discovers a working dsh at startup
  // — explicit config.command, then a harnessRoot checkout, then a bounded
  // filesystem search, then the npm package via npx. Override explicitly with
  // the DSH_HARNESS_ROOT env var if auto-discovery misses your checkout.
  // Forward slashes work fine on Windows.
  harnessRoot: '',
  // Optional full override of the launch command (array form avoids quoting):
  //   ["npx", "@deepseek-ai/dsh", "web"]
  // Leave null to auto-build:  <nodeBin> --import tsx/esm apps/cli/src/bin.ts web
  command: null,
  // Node executable used to launch the harness in auto mode ("node" resolves via PATH).
  nodeBin: 'node',
  // Listen port: a number (e.g. 3080) or "auto" (passes --port 0 and parses the
  // real URL from stdout). A fixed port already in use falls back to auto.
  port: 3080,
  // Extra arguments appended to the dsh web invocation.
  extraArgs: [],
  // Extra environment variables for the harness process.
  env: {},
  window: { width: 1280, height: 860 },
  // UI theme injected into the loaded web page (assets/themes/<name>/).
  theme: {
    enabled: true,
    name: 'marisa',
  },
  // Desktop pet (transparent always-on-top companion window).
  pet: {
    enabled: true,
    width: 300,
    height: 400,
    statsIntervalMs: 2000,
    // Feature toggles (each false hides the corresponding pet capability).
    tokens: { enabled: true },    // live token-usage pill
    notify: { enabled: true },    // approval / turn-complete reminders
  },
}

function resolveDefaults() {
  const d = { ...DEFAULTS, window: { ...DEFAULTS.window } }
  if (process.env.DSH_HARNESS_ROOT) d.harnessRoot = process.env.DSH_HARNESS_ROOT
  return d
}

/**
 * Load and validate user config. Packaged builds fall back to the bundled
 * (read-only) config.json until a user copy exists in userData.
 */
function loadConfig() {
  const file = configFile()
  const bundled = path.join(projectRoot(), 'config.json')
  // In dev `file === bundled`; in a fresh packaged install the user copy does
  // not exist yet, so seed from the bundled default.
  const source = file === bundled || fs.existsSync(file) ? file : bundled
  const defaults = resolveDefaults()
  let user = {}
  if (fs.existsSync(source)) {
    try {
      user = JSON.parse(fs.readFileSync(source, 'utf8')) || {}
    } catch (err) {
      console.error('[config] failed to parse config.json, using defaults:', err.message)
    }
  }
  const merged = {
    ...defaults,
    ...user,
    window: { ...defaults.window, ...(user.window || {}) },
    env: { ...(user.env || {}) },
    theme: { ...defaults.theme, ...(user.theme || {}) },
    pet: {
      ...defaults.pet,
      ...(user.pet || {}),
      tokens: { ...defaults.pet.tokens, ...((user.pet || {}).tokens || {}) },
      notify: { ...defaults.pet.notify, ...((user.pet || {}).notify || {}) },
    },
  }
  if (merged.port !== 'auto') {
    const n = Number(merged.port)
    merged.port = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 'auto'
  }
  if (typeof merged.harnessRoot !== 'string' || !merged.harnessRoot) {
    merged.harnessRoot = defaults.harnessRoot
  }
  return merged
}

/**
 * Persist a shallow patch back to <project root>/config.json (pretty-printed).
 * Nested sections (theme/pet) are replaced wholesale by the caller's patch.
 * @param {object} patch
 */
function writeConfig(patch) {
  const file = configFile()
  let current = {}
  if (fs.existsSync(file)) {
    try {
      current = JSON.parse(fs.readFileSync(file, 'utf8')) || {}
    } catch (err) {
      console.error('[config] failed to parse config.json, rewriting from patch:', err.message)
    }
  }
  const next = { ...current, ...patch }
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
}

module.exports = { loadConfig, writeConfig, configFile, projectRoot, DEFAULTS }
