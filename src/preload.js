'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, cb) {
  const handler = (_event, payload) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// Minimal, explicit surface for the control/loading screen. No Node access is
// exposed to any page — only these five capabilities.
contextBridge.exposeInMainWorld('dsh', {
  getState: () => ipcRenderer.invoke('dsh:get-state'),
  onStatus: (cb) => subscribe('dsh:status', cb),
  onLog: (cb) => subscribe('dsh:log', cb),
  restart: () => ipcRenderer.send('dsh:restart'),
  quit: () => ipcRenderer.send('dsh:quit'),
  // Turn-lifecycle events (the theme runtime reports generation start/done).
  notifyTurn: (event) => ipcRenderer.send('dsh:turn', event),
  // General pet events (tokens / authorization / chat reply) forwarded to the pet.
  notifyPet: (event) => ipcRenderer.send('dsh:pet', event),
  // Sidebar pet toggle (injected theme UI).
  togglePet: () => ipcRenderer.send('dsh:pet-toggle'),
  getPetState: () => ipcRenderer.invoke('dsh:pet-state'),
  onPetState: (cb) => subscribe('dsh:pet-state-push', cb),
})
