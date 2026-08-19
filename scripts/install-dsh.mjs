#!/usr/bin/env node
/**
 * One-click dsh installer for the dsh-desktop shell.
 *
 * Usage:
 *   node scripts/install-dsh.mjs                 # default: npm global install
 *   node scripts/install-dsh.mjs --npm           # same (explicit)
 *   node scripts/install-dsh.mjs --source        # git clone + npm install
 *   node scripts/install-dsh.mjs --source --dir D:/dev/agent/dsh/deepseek-harness
 *   node scripts/install-dsh.mjs --config <path> # config.json to update
 *   node scripts/install-dsh.mjs --dry-run       # print plan, change nothing
 *
 * --npm     installs @deepseek-ai/dsh globally via npm, verifies `dsh
 *           --version`, then writes `config.command = ["dsh","web"]` so the
 *           shell launches it directly.
 * --source  clones https://github.com/deepseek-ai/deepseek-harness.git and
 *           runs `npm install` inside it, then writes `config.harnessRoot`.
 *
 * The desktop shell passes `--config` (its userData config.json) when running
 * this from a packaged build; standalone use defaults to the repo config.json.
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_REPO = 'https://github.com/deepseek-ai/deepseek-harness.git'
const PKG = '@deepseek-ai/dsh'
const DEFAULT_SOURCE_DIR = join(homedir(), 'dsh', 'deepseek-harness')

const args = process.argv.slice(2)
const MODE = args.includes('--source') ? 'source' : 'npm'
const DRY = args.includes('--dry-run')
const cfgFlag = args.indexOf('--config')
const CONFIG = cfgFlag !== -1 ? args[cfgFlag + 1] : join(ROOT, 'config.json')
const dirFlag = args.indexOf('--dir')
const SOURCE_DIR = dirFlag !== -1 ? args[dirFlag + 1] : DEFAULT_SOURCE_DIR

function log(line) { console.log('[install-dsh] ' + line) }
function fail(msg) {
  console.error('\n[install-dsh] 失败：' + msg)
  console.error('如需管理员权限（Windows npm 全局安装），请右键「以管理员身份运行」本脚本，或改用 npx（无需安装）：npx --yes @deepseek-ai/dsh web')
  process.exit(1)
}
function sh(cmd, opts = {}) {
  log('$ ' + cmd)
  if (DRY) return { status: 0 }
  return spawnSync(cmd, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
}
function check(cmd) {
  if (DRY) return true
  try {
    execSync(cmd, { stdio: 'ignore', shell: process.platform === 'win32' })
    return true
  } catch { return false }
}

function readConfig() {
  try { return JSON.parse(readFileSync(CONFIG, 'utf8')) || {} } catch { return {} }
}
function writeConfig(config) {
  if (DRY) { log('将写入配置：' + CONFIG); return }
  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n')
  log('已更新配置：' + CONFIG)
}

function ensureNode() {
  if (!check('node --version')) {
    fail('未检测到 Node.js。请先安装 Node.js（https://nodejs.org），安装后重新运行本脚本。')
  }
  if (!check('npm --version')) {
    fail('未检测到 npm。请确认 Node.js 安装完整。')
  }
}

async function installNpm() {
  log('模式：npm 全局安装 ' + PKG)
  ensureNode()
  if (check('dsh --version')) {
    log('dsh 已安装：' + execSync('dsh --version').toString().trim())
  } else {
    const res = sh('npm install -g ' + PKG)
    if (res.status !== 0) {
      // EACCES is the common Windows global-install failure; fall back to npx.
      log('全局安装失败（可能需要管理员权限）。可改用 npx 方式（无需安装）：')
      log('  npx --yes @deepseek-ai/dsh web')
      fail('npm install -g 失败（exit ' + res.status + '）')
    }
    if (!check('dsh --version')) {
      log('安装完成但 `dsh` 不在 PATH 中；脚本将改用 npx 方式启动。')
    }
  }
  const cfg = readConfig()
  cfg.command = ['dsh', 'web']
  writeConfig(cfg)
  log('完成。启动 dsh-desktop 即可使用（或先关闭已打开的窗口再重开）。')
}

async function installSource() {
  log('模式：源码克隆安装 → ' + SOURCE_DIR)
  ensureNode()
  if (!check('git --version')) fail('未检测到 git，请先安装 git（https://git-scm.com）。')
  if (existsSync(join(SOURCE_DIR, 'package.json'))) {
    log('目标目录已存在（可能是已有检出）：' + SOURCE_DIR)
  } else {
    sh('git clone ' + DEFAULT_REPO + ' "' + SOURCE_DIR + '"')
  }
  sh('npm install', { cwd: SOURCE_DIR })
  const cfg = readConfig()
  cfg.harnessRoot = SOURCE_DIR
  cfg.command = null
  writeConfig(cfg)
  log('完成。启动 dsh-desktop 即会以该检出启动（源码模式需要已安装 Node + npm）。')
}

console.log('\n=== dsh-desktop · dsh 一键部署 ===')
if (MODE === 'npm') installNpm()
else installSource()
