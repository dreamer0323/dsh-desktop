'use strict'

/**
 * Regression test for the writable-data overlay. Packaged builds run from the
 * read-only app.asar, so user data (config.json, customized themes, replaced
 * assets, pet image) must be redirected to a userData directory. This test
 * points DSH_USER_DATA_DIR at a temp dir — which activates the same overlay
 * path a packaged build takes — and asserts every write lands there while the
 * bundled marisa theme stays readable. Plain Node, no Electron.
 */

const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-userdata-'))
process.env.DSH_USER_DATA_DIR = TMP

const { loadConfig, writeConfig } = require('../src/config')
const themeApi = require('../src/theme')

function main() {
  const themesRoot = path.join(TMP, 'themes')
  const petFile = path.join(TMP, 'pet', 'marisa-fumo.png')

  // Bundled theme still shows through the overlay before any modification.
  assert.ok(themeApi.listThemes().some((t) => t.name === 'marisa'), 'bundled marisa listed')
  assert.strictEqual(themeApi.themeDir('marisa'), path.join(themeApi.THEMES_DIR, 'marisa'),
    'untouched marisa resolves to the bundled dir')

  // Config writes go to userData, not the repo.
  writeConfig({ theme: { name: 'marisa' } })
  const cfgFile = path.join(TMP, 'config.json')
  assert.ok(fs.existsSync(cfgFile), 'config.json written into userData')
  assert.strictEqual(loadConfig().theme.name, 'marisa', 'config read back from userData')

  // Saving params on the bundled theme materializes it into userData.
  const manifest = themeApi.loadManifest('marisa')
  assert.ok(manifest, 'bundled manifest loads')
  manifest.params = { ...manifest.params, accent: '#ff0000' }
  themeApi.saveManifest('marisa', manifest)
  const materialized = path.join(themesRoot, 'marisa')
  assert.ok(fs.existsSync(path.join(materialized, 'theme.json')), 'theme materialized into userData')
  assert.ok(fs.existsSync(path.join(materialized, 'template.css')), 'template.css copied for materialized theme')
  assert.strictEqual(themeApi.themeDir('marisa'), materialized, 'themeDir resolves to userData copy after save')
  assert.strictEqual(themeApi.loadManifest('marisa').params.accent, '#ff0000', 'edited params read back')

  // Creating a theme clones the template into userData.
  const created = themeApi.createTheme('testone', 'Test One')
  assert.strictEqual(created.name, 'testone')
  assert.strictEqual(themeApi.themeDir('testone'), path.join(themesRoot, 'testone'),
    'created theme lives in userData')

  // Asset replacement copies into the userData theme dir.
  const src = path.join(TMP, 'src.png')
  fs.writeFileSync(src, 'fake-png-bytes')
  const res = themeApi.replaceAsset('testone', 'props.star', src)
  assert.ok(/\.png$/.test(res.rel), 'asset slot file copied: ' + res.rel)
  assert.ok(fs.existsSync(path.join(themesRoot, 'testone', res.rel)), 'replaced asset lives in userData')

  // Pet image replacement writes into userData and resolves there.
  const petRes = themeApi.replacePetImage(src)
  assert.ok(fs.existsSync(petFile), 'pet image written into userData')
  assert.strictEqual(themeApi.petImageFile(), petFile, 'petImageFile resolves to the userData copy')
  assert.ok(petRes.dataUri.startsWith('data:image/png;base64,'), 'pet replacement returns a data uri')

  // Deleting a custom theme removes only the userData copy (bundled stays).
  themeApi.removeTheme('testone')
  assert.ok(!fs.existsSync(path.join(themesRoot, 'testone')), 'custom theme removed from userData')
  assert.ok(themeApi.listThemes().some((t) => t.name === 'marisa'), 'bundled marisa untouched')

  console.log('userdata: OK (config / themes / assets / pet writes redirected to userData)')
  fs.rmSync(TMP, { recursive: true, force: true })
}

try {
  main()
} catch (err) {
  console.error('userdata: FAIL', err)
  fs.rmSync(TMP, { recursive: true, force: true })
  process.exit(1)
}
