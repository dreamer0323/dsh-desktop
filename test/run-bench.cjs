const { spawn } = require('node:child_process')
const { join } = require('node:path')
const electronBin = require('electron')
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electronBin, [join(__dirname, 'bench-pet.cjs')], { env, stdio: 'inherit', windowsHide: true })
child.on('exit', (c) => process.exit(c || 0))
