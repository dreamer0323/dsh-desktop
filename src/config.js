'use strict'

const fs = require('node:fs')
const path = require('node:path')

/** Root of this desktop wrapper project (one level above src/). */
function projectRoot() {
  return path.resolve(__dirname, '..')
}

const DEFAULTS = {
  // The DeepSeek Harness repository checkout the wrapper launches.
  // Point this at your checkout, or override via the DSH_HARNESS_ROOT env var.
  // Forward slashes work fine on Windows.
  harnessRoot: 'D:/dev/agent/dsh/deepseek-harness',
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

/** Load and validate user config from <project root>/config.json. */
function loadConfig() {
  const file = path.join(projectRoot(), 'config.json')
  const defaults = resolveDefaults()
  let user = {}
  if (fs.existsSync(file)) {
    try {
      user = JSON.parse(fs.readFileSync(file, 'utf8')) || {}
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

module.exports = { loadConfig, projectRoot, DEFAULTS }
