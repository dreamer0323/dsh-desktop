'use strict'

const { spawn, spawnSync } = require('node:child_process')
const { EventEmitter } = require('node:events')
const net = require('node:net')

const NL = String.fromCharCode(10) // line feed
const CR = String.fromCharCode(13) // carriage return

function trimLineEnds(value) {
  let text = String(value)
  while (text.endsWith(NL) || text.endsWith(CR)) text = text.slice(0, -1)
  return text
}

/** Pull the canonical URL out of the harness readiness line: "dsh web: http://127.0.0.1:PORT". */
function extractUrl(line) {
  const marker = 'dsh web:'
  const idx = line.indexOf(marker)
  if (idx === -1) return null
  const rest = line.slice(idx + marker.length).trim()
  const http = rest.indexOf('http')
  if (http === -1) return null
  const tail = rest.slice(http)
  const space = tail.indexOf(' ')
  return space === -1 ? tail : tail.slice(0, space)
}

/**
 * Manages one dsh web child process: launches it, parses its readiness URL from
 * stdout, streams logs, and tears the process tree down on stop().
 * Pure Node — no Electron imports — so it can be smoke-tested headlessly.
 */
class DshServer extends EventEmitter {
  constructor(config) {
    super()
    this.config = config
    this.child = null
    this.url = null
    this._logs = []
    this._lastError = undefined
  }

  log(line) {
    const text = trimLineEnds(line)
    this._logs.push(text)
    if (this._logs.length > 1000) this._logs.shift()
    this.emit('log', text)
  }

  get logs() {
    return this._logs.slice()
  }

  buildSpec() {
    const cfg = this.config
    let command
    let args
    if (Array.isArray(cfg.command) && cfg.command.length > 0) {
      command = cfg.command[0]
      args = cfg.command.slice(1)
    } else if (typeof cfg.command === 'string' && cfg.command.trim() !== '') {
      if (process.platform === 'win32') {
        command = 'cmd.exe'
        args = ['/d', '/s', '/c', cfg.command]
      } else {
        command = '/bin/sh'
        args = ['-c', cfg.command]
      }
    } else {
      command = cfg.nodeBin || 'node'
      args = ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web']
      if (cfg.port === 'auto' || cfg.port === 0) args.push('--port', '0')
      else if (typeof cfg.port === 'number') args.push('--port', String(cfg.port))
    }
    if (Array.isArray(cfg.extraArgs) && cfg.extraArgs.length > 0) {
      args = args.concat(cfg.extraArgs)
    }
    return {
      command,
      args,
      cwd: cfg.harnessRoot,
      env: { ...process.env, ...(cfg.env || {}) },
    }
  }

  portBusy(port) {
    return new Promise((resolve) => {
      if (typeof port !== 'number' || port === 0) return resolve(false)
      const socket = net.connect({ host: '127.0.0.1', port, timeout: 500 })
      const done = (busy) => {
        try { socket.destroy() } catch (e) { /* ignore */ }
        resolve(busy)
      }
      socket.once('connect', () => done(true))
      socket.once('error', () => done(false))
      socket.once('timeout', () => done(false))
    })
  }

  async start() {
    if (this.child) return
    const spec = this.buildSpec()
    let args = spec.args

    // A fixed port that is already occupied falls back to OS-assigned (--port 0).
    const fixedPort = (typeof this.config.port === 'number' && this.config.port !== 0)
      ? this.config.port
      : null
    if (fixedPort !== null && await this.portBusy(fixedPort)) {
      this.log('[dsh-desktop] port ' + fixedPort + ' is already in use (another dsh web instance?); using an auto-assigned port instead.')
      args = args.map((a) => (a === String(fixedPort) ? '0' : a))
    }

    this.emit('status', { state: 'starting' })
    this.log('[dsh-desktop] launching: ' + spec.command + ' ' + args.join(' '))
    this.log('[dsh-desktop] cwd: ' + spec.cwd)

    const child = spawn(spec.command, args, {
      cwd: spec.cwd,
      env: spec.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    this._lastError = undefined

    const finalize = (code, signal) => {
      if (child.__done) return
      child.__done = true
      if (this.child === child) this.child = null
      if (child.__intentionalStop) return
      const wasReady = Boolean(this.url)
      this.emit('status', {
        state: wasReady ? 'stopped' : 'error',
        code: code == null ? undefined : code,
        signal: signal == null ? undefined : signal,
        message: this._lastError,
      })
      this.emit('exit', { code, signal, wasReady })
    }

    let buffer = ''
    const scan = (chunk) => {
      buffer += String(chunk)
      let idx
      while ((idx = buffer.indexOf(NL)) !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        const line = raw.endsWith(CR) ? raw.slice(0, -1) : raw
        if (!line) continue
        this.log(line)
        if (!this.url) {
          const url = extractUrl(line)
          if (url) {
            this.url = url
            this.emit('status', { state: 'ready', url: this.url })
            this.emit('ready', { url: this.url })
          }
        }
      }
    }

    child.stdout.on('data', scan)
    child.stderr.on('data', scan)

    child.on('error', (err) => {
      this._lastError = err.message
      this.log('[dsh-desktop] launch error: ' + err.message)
      // A spawn failure (e.g. node not found) may not emit 'exit'; finalize now.
      finalize(1, null)
    })

    child.on('exit', (code, signal) => finalize(code, signal))
  }

  /** Synchronously terminate the harness process tree (best-effort). */
  stop() {
    const child = this.child
    this.child = null
    if (!child || child.__done) return
    child.__intentionalStop = true
    try {
      if (process.platform === 'win32') {
        // Node cannot deliver SIGTERM/SIGINT to a Windows child's handlers, so
        // kill the whole tree to avoid orphaning tool subprocesses.
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        })
      } else {
        child.kill('SIGTERM')
        const t = setTimeout(() => {
          if (child.exitCode === null && !child.__done) {
            try { child.kill('SIGKILL') } catch (e) { /* ignore */ }
          }
        }, 4000)
        if (t.unref) t.unref()
      }
    } catch (e) { /* best effort */ }
  }
}

module.exports = { DshServer }
