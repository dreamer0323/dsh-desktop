'use strict'

const path = require('node:path')

/**
 * Where user-mutable data lives.
 *
 * In a packaged build, src/ ui/ assets/ and config.json are bundled inside the
 * read-only app.asar — writes to those paths throw ENOENT. So config.json,
 * customized themes, replaced assets and the pet image are redirected to
 * Electron's userData directory in packaged builds. Running from the source
 * tree (`npm start`) keeps writing the repo files exactly as before.
 *
 * Overridable via DSH_USER_DATA_DIR so tests can exercise the packaged layout
 * without a real app.asar.
 */

function isPackaged() {
  return path.normalize(__dirname).includes('app.asar')
}

function electronApp() {
  // Under Electron's main process require('electron') returns the module (with
  // `app`); from plain Node (tests) it resolves to the binary path string and
  // `app` is null.
  let mod = null
  try { mod = require('electron') } catch (err) { return null }
  return mod && mod.app && typeof mod.app.getPath === 'function' ? mod.app : null
}

/**
 * Root directory for all user-writable runtime data.
 *   - DSH_USER_DATA_DIR env override (tests)
 *   - packaged build: Electron's userData directory
 *   - dev / tests: the project root (config.json / assets/ stay in place)
 */
function userDataDir() {
  if (process.env.DSH_USER_DATA_DIR) return path.resolve(process.env.DSH_USER_DATA_DIR)
  if (isPackaged() && electronApp()) return electronApp().getPath('userData')
  return path.resolve(__dirname, '..')
}

/** True when user data is redirected away from the source tree (packaged or override). */
function isOverlay() {
  return path.resolve(userDataDir()) !== path.resolve(__dirname, '..')
}

module.exports = { userDataDir, isPackaged, isOverlay }
