import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { DshServer } = require('../src/server.js')

const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-smoke-'))
console.log('DSH_HOME: ' + home)

const harnessRoot = process.env.DSH_HARNESS_ROOT || 'D:/dev/agent/dsh/deepseek-harness'

const server = new DshServer({
  harnessRoot,
  nodeBin: 'node',
  port: 0,
  extraArgs: [],
  env: { DSH_HOME: home },
})

let settled = false
const timeout = setTimeout(() => fail('timed out waiting for readiness'), 180000)

function fail(msg) {
  if (settled) return
  settled = true
  clearTimeout(timeout)
  console.error('SMOKE FAIL: ' + msg)
  server.stop()
  rmSync(home, { recursive: true, force: true })
  process.exit(1)
}

server.on('log', (line) => console.log('[log] ' + line))
server.on('status', (s) => console.log('[status] ' + JSON.stringify(s)))
server.on('ready', async ({ url }) => {
  console.log('[ready] ' + url)
  try {
    const res = await fetch(url + '/')
    const ct = res.headers.get('content-type') || ''
    console.log('[http] GET / -> ' + res.status + ' ' + ct)
    if (res.status !== 200) throw new Error('non-200 status: ' + res.status)
    clearTimeout(timeout)
    settled = true
    console.log('SMOKE OK')
    server.stop()
    setTimeout(() => { rmSync(home, { recursive: true, force: true }); process.exit(0) }, 400)
  } catch (err) {
    fail(err.message)
  }
})
server.on('exit', ({ code, signal, wasReady }) => {
  if (!wasReady) fail('exited before ready (code=' + code + ', signal=' + signal + ')')
})

server.start()
