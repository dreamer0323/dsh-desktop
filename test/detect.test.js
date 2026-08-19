'use strict'

/**
 * Headless tests for src/detect.js (dsh harness discovery): checkout detection
 * by CLI entry / package name, bounded filesystem search via DSH_SEARCH_ROOTS,
 * and resolveHarness ordering. Plain Node, no Electron.
 */

const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const detect = require('../src/detect')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-detect-'))

function makeFakeHarness(name) {
  const dir = path.join(TMP, name)
  fs.mkdirSync(path.join(dir, 'apps', 'cli', 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'apps', 'cli', 'src', 'bin.ts'), '// fake\n')
  return dir
}

function main() {
  const harness = makeFakeHarness('my-deepseek-harness')
  const notHarness = path.join(TMP, 'not-a-harness')
  fs.mkdirSync(notHarness, { recursive: true })

  /* 1. looksLikeHarness by CLI entry (apps/cli/src/bin.ts). */
  assert.strictEqual(detect.looksLikeHarness(harness), true, 'CLI entry marks a checkout')
  assert.strictEqual(detect.looksLikeHarness(notHarness), false, 'plain dir is not a checkout')
  assert.strictEqual(detect.looksLikeHarness(''), false, 'empty path is not a checkout')

  /* 2. looksLikeHarness by package name. Named so the filesystem search
   * (regex /harness|deepseek/i on the dir name) skips it — keeps the search
   * assertion below deterministic. */
  const pkgHarness = path.join(TMP, 'pkg-dsh-only')
  fs.mkdirSync(pkgHarness, { recursive: true })
  fs.writeFileSync(path.join(pkgHarness, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-root' }))
  assert.strictEqual(detect.looksLikeHarness(pkgHarness), true, 'package name marks a checkout')

  /* 3. Filesystem search honors DSH_SEARCH_ROOTS. */
  const prev = process.env.DSH_SEARCH_ROOTS
  process.env.DSH_SEARCH_ROOTS = TMP
  try {
    assert.strictEqual(detect.findCheckout(), harness, 'search finds the named checkout')
  } finally {
    if (prev === undefined) delete process.env.DSH_SEARCH_ROOTS
    else process.env.DSH_SEARCH_ROOTS = prev
  }

  /* 4. resolveHarness ordering: explicit command wins (no patch). */
  const configured = detect.resolveHarness({ command: ['dsh', 'web'] })
  assert.strictEqual(configured.status, 'configured', 'explicit command is trusted')
  assert.deepStrictEqual(configured.patch, {}, 'explicit command needs no patch')

  /* 5. Valid harnessRoot wins over search (no patch). */
  const rooted = detect.resolveHarness({ harnessRoot: harness })
  assert.strictEqual(rooted.status, 'checkout', 'valid harnessRoot accepted')
  assert.deepStrictEqual(rooted.patch, {}, 'valid harnessRoot needs no patch')

  /* 6. No target → search fills harnessRoot. */
  process.env.DSH_SEARCH_ROOTS = TMP
  try {
    const found = detect.resolveHarness({ harnessRoot: path.join(TMP, 'missing') })
    assert.strictEqual(found.status, 'checkout', 'search fallback resolves')
    assert.strictEqual(found.patch.harnessRoot, harness, 'search result patched into config')
  } finally {
    if (prev === undefined) delete process.env.DSH_SEARCH_ROOTS
    else process.env.DSH_SEARCH_ROOTS = prev
  }

  /* 7. applyPatch merges cleanly. */
  const cfg = { harnessRoot: null, command: null }
  const patched = detect.applyPatch(cfg, { harnessRoot: harness, command: ['npx', 'dsh', 'web'] })
  assert.strictEqual(patched.harnessRoot, harness, 'harnessRoot patched')
  assert.deepStrictEqual(patched.command, ['npx', 'dsh', 'web'], 'command patched')

  console.log('detect: OK (CLI/pkg markers / search / resolveHarness ordering / applyPatch)')
  fs.rmSync(TMP, { recursive: true, force: true })
}

try {
  main()
} catch (err) {
  console.error('detect: FAIL', err)
  fs.rmSync(TMP, { recursive: true, force: true })
  process.exit(1)
}
