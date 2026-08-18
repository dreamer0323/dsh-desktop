'use strict'
// Benchmark: pet window creation latency + memory footprint (real code path).
const { app } = require('electron')
const { createPetWindow, closePetWindow } = require('../src/pet')

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const t0 = Date.now()
  const win = createPetWindow({
    pet: { enabled: true, width: 300, height: 400, statsIntervalMs: 2000,
           chat: { enabled: true }, tokens: { enabled: true }, notify: { enabled: true } },
  })
  if (!win) { console.log('BENCH FAIL: no pet window'); app.exit(1); return }
  win.webContents.once('did-finish-load', () => {
    const loadMs = Date.now() - t0
    setTimeout(() => {
      const m = process.memoryUsage()
      console.log('PET_BENCH ' + JSON.stringify({
        createToLoadMs: loadMs,
        rssMB: +(m.rss / 1048576).toFixed(1),
        heapUsedMB: +(m.heapUsed / 1048576).toFixed(1),
        externalMB: +(m.external / 1048576).toFixed(1),
      }))
      closePetWindow()
      app.exit(0)
    }, 800)
  })
})
