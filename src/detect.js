'use strict'

/**
 * dsh harness discovery (pure Node, no Electron).
 *
 * The shell used to hard-code `harnessRoot` to one machine's checkout. Clients
 * won't share that path, so at startup we resolve a working dsh in order:
 *   1. an explicit `config.command` (trusted as-is),
 *   2. a valid `config.harnessRoot` checkout,
 *   3. a bounded filesystem search for a `*harness*` / `*deepseek*` checkout,
 *   4. the npm package via `npx --yes @deepseek-ai/dsh` (async, downloads once
 *      into the npx cache — no admin, no global install).
 * Results are cached back into config.json so later starts are instant.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

/** Command that runs dsh web straight from the npm package (npx cache). */
const NPX_COMMAND = ['npx', '--yes', '@deepseek-ai/dsh', 'web']

const PKG_RE = /dsh|harness/i
const NAME_RE = /harness|deepseek/i

/** True when `dir` is a dsh harness checkout (CLI entry or package name). */
function looksLikeHarness(dir) {
  if (!dir || typeof dir !== 'string') return false
  try {
    if (fs.existsSync(path.join(dir, 'apps', 'cli', 'src', 'bin.ts'))) return true
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return !!(pkg && typeof pkg.name === 'string' && PKG_RE.test(pkg.name))
  } catch (err) {
    return false
  }
}

/** Search roots (override with DSH_SEARCH_ROOTS, ';'-separated on Windows). */
function searchRoots() {
  if (process.env.DSH_SEARCH_ROOTS) {
    return String(process.env.DSH_SEARCH_ROOTS).split(path.delimiter).filter(Boolean)
  }
  const home = os.homedir()
  return [
    process.env.DSH_HOME,
    home,
    path.join(home, 'dsh'),
    path.join(home, 'dev'),
    path.join(home, 'projects'),
    path.join(home, 'code'),
    'D:/dev', 'C:/dev',
    'D:/dev/agent', 'C:/dev/agent',
  ].filter(Boolean)
}

function walk(dir, depth, maxDepth, seen, out) {
  if (out.length || depth > maxDepth) return
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (err) { return }
  for (const d of entries) {
    if (!d.isDirectory() || d.name.startsWith('.') || d.name === 'node_modules') continue
    const full = path.join(dir, d.name)
    if (seen.has(full)) continue
    seen.add(full)
    if (NAME_RE.test(d.name) && looksLikeHarness(full)) { out.push(full); return }
    if (depth < maxDepth) walk(full, depth + 1, maxDepth, seen, out)
  }
}

/** Find a checkout under the search roots (bounded walk, depth 3). */
function findCheckout(maxDepth = 3) {
  const seen = new Set()
  const out = []
  for (const root of searchRoots()) {
    if (!root || seen.has(path.resolve(root))) continue
    seen.add(path.resolve(root))
    walk(root, 0, maxDepth, seen, out)
    if (out.length) return out[0]
  }
  return null
}

/** Resolve a working launch target synchronously (fast paths only). */
function resolveHarness(cfg) {
  const cur = cfg || {}
  if (Array.isArray(cur.command) && cur.command.length) {
    return { patch: {}, status: 'configured', message: '使用配置的启动命令：' + cur.command.join(' ') }
  }
  if (cur.harnessRoot && looksLikeHarness(cur.harnessRoot)) {
    return { patch: {}, status: 'checkout', message: '使用本地检出：' + cur.harnessRoot }
  }
  const found = findCheckout()
  if (found) {
    return { patch: { harnessRoot: found }, status: 'checkout', message: '已找到 dsh 检出：' + found }
  }
  return null // caller should fall back to the async npx probe
}

/**
 * Probe whether the npm package is reachable — `npm view` queries the registry
 * metadata only (no download, sub-second when the registry is reachable), which
 * is enough to commit to `npx --yes @deepseek-ai/dsh web`. The actual first
 * launch then streams its download through the server logs.
 * @returns {Promise<boolean>}
 */
function npxAvailable() {
  return new Promise((resolve) => {
    let settled = false
    const done = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    // Windows: `npm` is a .cmd shim — run through cmd /c without shell:true
    // (avoids the DEP0190 args+shell deprecation; args are fixed, not user input).
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm view @deepseek-ai/dsh version'], {
          windowsHide: true, stdio: 'ignore',
        })
      : spawn('npm', ['view', '@deepseek-ai/dsh', 'version'], { stdio: 'ignore' })
    const timer = setTimeout(() => { try { child.kill() } catch (err) { /* ignore */ } }, 30000)
    child.on('error', () => { clearTimeout(timer); done(false) })
    child.on('exit', (code) => { clearTimeout(timer); done(code === 0) })
  })
}

/** Apply a detection patch onto a config object (returns the new object). */
function applyPatch(cfg, patch) {
  const next = { ...cfg }
  if (patch.harnessRoot && patch.harnessRoot !== cfg.harnessRoot) next.harnessRoot = patch.harnessRoot
  if (patch.command && JSON.stringify(patch.command) !== JSON.stringify(cfg.command)) next.command = patch.command
  return next
}

module.exports = {
  NPX_COMMAND,
  looksLikeHarness,
  findCheckout,
  resolveHarness,
  npxAvailable,
  applyPatch,
}
