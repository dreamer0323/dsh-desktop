'use strict'

/**
 * Preload for the desktop pet window. Exposes a minimal receive-only bridge:
 * the pet never gets Node access, only stats + turn events pushed by main.
 */

const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, cb) {
  const handler = (_event, payload) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('pet', {
  onStats: (cb) => subscribe('pet:stats', cb),
  onTurn: (cb) => subscribe('pet:turn', cb),
})
