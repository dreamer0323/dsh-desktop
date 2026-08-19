'use strict'

/**
 * Preload for the theme settings window. Exposes a minimal `dshTheme` bridge:
 * theme listing/read/create/save/remove, live apply, and native asset pickers.
 * No Node access is exposed to the page — only these capabilities.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshTheme', {
  // Param schema (field defs + defaults) shared with the main process.
  schema: () => ipcRenderer.invoke('dsh:theme:schema'),
  // Full param set for the currently-loaded theme (for the advanced JSON editor).
  defaults: () => ipcRenderer.invoke('dsh:theme:defaults'),
  // Friendly → full param expansion.
  expand: (friendly) => ipcRenderer.invoke('dsh:theme:expand', friendly),

  list: () => ipcRenderer.invoke('dsh:theme:list'),
  read: (name) => ipcRenderer.invoke('dsh:theme:read', name),
  create: (name, displayName) => ipcRenderer.invoke('dsh:theme:create', { name, displayName }),
  setActive: (name) => ipcRenderer.invoke('dsh:theme:set-active', name),
  save: (name, displayName, params) => ipcRenderer.invoke('dsh:theme:save', { name, displayName, params }),
  remove: (name) => ipcRenderer.invoke('dsh:theme:remove', name),
  apply: () => ipcRenderer.invoke('dsh:theme:apply'),

  // Open a native file dialog, copy the pick into the theme dir, persist and
  // re-render. Returns the updated slot info (or null when cancelled).
  pickAsset: (name, slot, kind) => ipcRenderer.invoke('dsh:theme:pick-asset', { name, slot, kind }),
  pickPet: () => ipcRenderer.invoke('dsh:theme:pick-pet'),

  // Keep the settings window in sync with main-window state.
  onState: (cb) => {
    const handler = (_event, payload) => cb(payload)
    ipcRenderer.on('dsh:theme-state', handler)
    return () => ipcRenderer.removeListener('dsh:theme-state', handler)
  },
})
