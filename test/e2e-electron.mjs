import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronBin = require('electron')

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-e2e-'))
console.log('DSH_HOME: ' + home)

const NL = String.fromCharCode(10)
let settled = false
let readyUrl = null

function kill() {
  try {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } catch (e) { /* ignore */ }
}

function fail(msg) {
  if (settled) return
  settled = true
  clearTimeout(timeout)
  clearInterval(check)
  console.error('E2E FAIL: ' + msg)
  kill()
  setTimeout(() => { rmSync(home, { recursive: true, force: true }); process.exit(1) }, 300)
}

const child = spawn(electronBin, ['.'], {
  cwd: root,
  env: { ...process.env, DSH_HOME: home, DSH_HARNESS_ROOT: 'D:/dev/agent/dsh/deepseek-harness' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

let out = ''
child.stdout.on('data', (d) => { out += String(d); process.stdout.write(d) })
child.stderr.on('data', (d) => { out += String(d); process.stderr.write(d) })

const timeout = setTimeout(() => fail('timed out waiting for readiness'), 120000)

const check = setInterval(async () => {
  const marker = 'ready at http'
  const idx = out.indexOf(marker)
  if (idx === -1 || readyUrl) return
  const http = out.indexOf('http', idx)
  const tail = out.slice(http)
  const nl = tail.indexOf(NL)
  readyUrl = (nl === -1 ? tail : tail.slice(0, nl)).trim()
  console.log('[e2e] ready at ' + readyUrl)
  try {
    const res = await fetch(readyUrl + '/')
    console.log('[e2e] GET / -> ' + res.status)
    if (res.status !== 200) throw new Error('non-200 status: ' + res.status)
    clearTimeout(timeout)
    clearInterval(check)
    settled = true
    console.log('E2E OK')
    kill()
    setTimeout(() => { rmSync(home, { recursive: true, force: true }); process.exit(0) }, 300)
  } catch (err) {
    fail(err.message)
  }
}, 1000)

child.on('exit', (code, signal) => {
  if (!settled) fail('electron exited early (code=' + code + ', signal=' + signal + ')')
})
