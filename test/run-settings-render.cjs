'use strict'

/* Launches the Electron runtime against test/settings-render.cjs (plain node
 * cannot run an Electron main script itself). */

const { spawn } = require('node:child_process')
const { join } = require('node:path')

const electronBin = require('electron')
// The parent shell may run with ELECTRON_RUN_AS_NODE=1 (electron.exe then
// behaves as plain Node); a real Electron runtime needs it cleared.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electronBin, [join(__dirname, 'settings-render.cjs')], {
  env,
  stdio: 'inherit',
  windowsHide: true,
})
child.on('exit', (code, signal) => {
  process.exit(code !== null ? code : (signal ? 1 : 0))
})
