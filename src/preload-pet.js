'use strict'

/**
 * Preload for the desktop pet window. Exposes a minimal receive-only bridge:
 * stats / turn / event / config, all pushed by main. No chat, no voice.
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
  onEvent: (cb) => subscribe('pet:event', cb),
  onConfig: (cb) => subscribe('pet:config', cb),
  // Effective pet image (data: URI) — the replacement lives in userData and
  // the bundled <img src> would show the default, so main pushes the winner.
  onImage: (cb) => subscribe('pet:image', cb),
})
