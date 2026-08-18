#!/usr/bin/env node
/**
 * Standardized release pipeline for dsh-desktop:
 *   test → build(dist) → verify artifacts → bump check → commit → tag → publish(GitHub)
 *
 * Usage:
 *   node scripts/release.mjs              # full release (needs gh CLI or GITHUB_TOKEN + network)
 *   node scripts/release.mjs --dry-run    # test + build + tag locally, NO publish (default safe)
 *   node scripts/release.mjs --skip-tests --skip-build   # skip the long steps
 *
 * Publish path: `gh release create` when available, else GitHub REST API via GITHUB_TOKEN.
 * If GitHub is unreachable (e.g. CN network without proxy), publish is skipped with a clear
 * message; run again with a working proxy once the network allows.
 */

import { execSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const SKIP_TESTS = args.includes('--skip-tests')
const SKIP_BUILD = args.includes('--skip-build')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const VERSION = pkg.version
const TAG = 'v' + VERSION

function sh(cmd, opts = {}) {
  console.log('\n$ ' + cmd)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
}

function fail(msg) {
  console.error('\n[release] ABORT: ' + msg)
  process.exit(1)
}

function networkUp() {
  try {
    execSync('curl -s -m 8 -o /dev/null https://api.github.com', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

console.log(`\n=== dsh-desktop release v${VERSION} (${DRY ? 'dry-run' : 'full'}) ===`)

/* 1. Tests (quality gate). */
if (!SKIP_TESTS) {
  console.log('\n[1/6] tests')
  sh('npm test')
} else console.log('\n[1/6] tests — skipped')

/* 2. Build distributables. */
if (!SKIP_BUILD) {
  console.log('\n[2/6] build (electron-builder)')
  sh('npm run dist')
} else console.log('\n[2/6] build — skipped')

/* 3. Verify artifacts. */
console.log('\n[3/6] verify artifacts')
const releaseDir = join(ROOT, 'release')
const exes = existsSync(releaseDir)
  ? readdirSync(releaseDir).filter((f) => /\.exe$/.test(f) && !/unpacked/.test(f))
  : []
if (!exes.length) fail('no .exe artifacts in release/ — did the build fail?')
exes.forEach((f) => console.log('  ✓ ' + f))

/* 4. Commit working tree (standard release = tag points at committed code). */
console.log('\n[4/6] commit + tag')
if (execSync('git status --porcelain', { cwd: ROOT }).toString().trim()) {
  sh('git add -A')
  sh(`git commit -m "chore: release v${VERSION}"`)
}
try { execSync(`git rev-parse ${TAG}`, { cwd: ROOT, stdio: 'ignore' }) }
catch { sh(`git tag ${TAG}`) }
console.log('  tag: ' + TAG)

/* 5. Publish. */
if (DRY) {
  console.log('\n[5/6] publish — skipped (--dry-run)')
  console.log(`\n=== dry-run done. To finish: node scripts/release.mjs (git push + GitHub release) ===`)
  process.exit(0)
}

console.log('\n[5/6] publish (GitHub)')
if (!networkUp()) {
  console.warn('  ⚠ GitHub unreachable (need proxy / VPN / open network). Publishing skipped.')
  console.warn('  完成后执行：')
  console.warn(`    1) 确保网络可达 GitHub（如设置 HTTPS_PROXY）`)
  console.warn(`    2) 安装 gh：winget install GitHub.cli 并 gh auth login，或设置 GITHUB_TOKEN`)
  console.warn(`    3) node scripts/release.mjs --skip-tests --skip-build`)
  process.exit(2)
}

let gh = null
try { gh = execSync('gh --version', { stdio: 'pipe' }).toString() } catch { gh = null }
if (gh) {
  sh(`git push origin HEAD`)
  sh(`git push origin ${TAG}`)
  sh(`gh release create ${TAG} release/*.exe --title "dsh-desktop v${VERSION}" --generate-notes`)
  console.log('\n=== released v' + VERSION + ' (gh) ===')
} else if (process.env.GITHUB_TOKEN) {
  sh(`git push origin HEAD`)
  sh(`git push origin ${TAG}`)
  const token = process.env.GITHUB_TOKEN
  const notes = `dsh-desktop v${VERSION}`
  const uploads = exes.map((f) => `-F "files[]=@${join(releaseDir, f).replace(/\\/g, '/')}"`).join(' ')
  sh(`curl -s -X POST -H "Authorization: token ${token}" https://api.github.com/repos/dreamer0323/dsh-desktop/releases -d '{"tag_name":"${TAG}","name":"dsh-desktop v${VERSION}","body":"${notes}"}'`)
  sh(`curl -s -X POST -H "Authorization: token ${token}" -H "Content-Type: application/octet-stream" ${uploads} https://uploads.github.com/repos/dreamer0323/dsh-desktop/releases/$(curl -s -H "Authorization: token ${token}" https://api.github.com/repos/dreamer0323/dsh-desktop/releases/tags/${TAG} | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).id))")/assets`)
  console.log('\n=== released v' + VERSION + ' (API) ===')
} else {
  fail('no `gh` CLI and no GITHUB_TOKEN — install gh (winget install GitHub.cli; gh auth login) or export GITHUB_TOKEN, then re-run')
}

console.log('\n[6/6] done')
