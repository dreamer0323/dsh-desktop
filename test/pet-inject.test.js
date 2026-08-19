'use strict'

/**
 * Headless test for assets/themes/marisa/inject.js v4 runtime: token watcher,
 * approval detector, turn-completion notice, sidebar pet tab, re-injection
 * guard. Runs the real injected script in a vm sandbox with a mocked DOM,
 * then drives its internal MutationObserver / timers. No Electron needed.
 */

const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'themes', 'marisa', 'inject.js'), 'utf8')

function makeHarness() {
  const notifyPetCalls = []
  const notifyTurnCalls = []
  const timers = []
  const intervals = []
  let moCallback = null
  const selectors = {}

  function el(tag) {
    const node = {
      tagName: tag,
      children: [],
      parentNode: null,
      _text: '',
      _attrs: {},
      isConnected: true,
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(k, v) { this._attrs[k] = v },
      getAttribute(k) { return this._attrs[k] },
      addEventListener() {},
      appendChild(c) { c.parentNode = this; this.children.push(c); return c },
      remove() {
        if (this.parentNode) {
          const i = this.parentNode.children.indexOf(this)
          if (i >= 0) this.parentNode.children.splice(i, 1)
          this.parentNode = null
        }
      },
      closest() { return null },
    }
    Object.defineProperty(node, 'textContent', {
      get() { return this._text },
      set(v) { this._text = String(v) },
    })
    Object.defineProperty(node, 'innerText', {
      get() { return this._text },
      set(v) { this._text = String(v) },
    })
    return node
  }

  const body = el('body')
  const doc = { body, querySelector(sel) { return selectors[sel] || null }, addEventListener() {}, createElement: el }

  const win = {
    __DSH_THEME_SOUNDS__: { click: null, hover: null, complete: null, error: null, auth: null },
    addEventListener() {},
    dsh: {
      notifyTurn: (e) => notifyTurnCalls.push(e),
      notifyPet: (e) => notifyPetCalls.push(e),
    },
  }

  const sandbox = {
    window: win,
    document: doc,
    console,
    crypto: { randomUUID: () => 'x' },
    AudioContext: undefined,
    setTimeout(fn, ms) { timers.push({ fn, ms: ms || 0 }); return timers.length },
    clearTimeout() {},
    setInterval(fn) { intervals.push(fn); return intervals.length },
    clearInterval() {},
    MutationObserver: function (cb) { moCallback = cb },
  }
  sandbox.MutationObserver.prototype = { observe() {} }

  vm.createContext(sandbox)
  vm.runInContext(SRC, sandbox)

  return {
    win, doc, body, sandbox, selectors, notifyPetCalls, notifyTurnCalls, timers, intervals, el,
    setEl(sel, node) { selectors[sel] = node },
    triggerMutation() { moCallback() },
    runTimers() { timers.splice(0).forEach((t) => { if (t.ms <= 30000) t.fn() }) },
    runIntervals() { intervals.slice().forEach((fn) => fn()) },
  }
}

const h = makeHarness()

function main() {
  /* 1. Token watcher — reads the composer stats line and emits tokens. */
  {
    const composer = h.el('div')
    composer.textContent = '1 轮 · 2 步 | 输入 12.2K tok · 输出 3.4K tok'
    h.setEl('[data-composer-seat]', composer)
    h.runTimers() // initial scanTokens timer
    h.runIntervals()
    const tok = h.notifyPetCalls.find((c) => c.kind === 'tokens')
    assert.ok(tok, 'tokens event emitted')
    assert.strictEqual(tok.input, 12200, 'input parsed')
    assert.strictEqual(tok.output, 3400, 'output parsed')
  }

  /* 2. Approval detector — appearing panel alerts, disappearing clears. */
  {
    const panel = h.el('div')
    panel.setAttribute('data-approval-key', 'appr-1')
    panel.textContent = '工具 Bash 请求越权执行\nls -la'
    h.setEl('[data-approval-key], [data-approval-scroll]', panel)
    h.setEl('[data-approval-scroll]', panel)
    h.triggerMutation(); h.runTimers()
    const authOn = h.notifyPetCalls.find((c) => c.kind === 'auth' && c.pending === true)
    assert.ok(authOn, 'auth pending emitted')
    assert.strictEqual(authOn.reason, '工具 Bash 请求越权执行', 'reason captured')

    h.setEl('[data-approval-key], [data-approval-scroll]', null)
    h.setEl('[data-approval-scroll]', null)
    h.triggerMutation(); h.runTimers()
    assert.ok(h.notifyPetCalls.some((c) => c.kind === 'auth' && c.pending === false), 'auth cleared emitted')
  }

  /* 3. Turn completion — a finished turn emits a done notice, never content. */
  {
    const stream = h.el('div')
    h.setEl('[data-streaming]', stream)
    h.triggerMutation(); h.runTimers()   // turn running
    stream.textContent = '主窗口的思考与回答'
    h.setEl('[data-streaming]', null)
    h.triggerMutation(); h.runTimers()   // turn done
    const done = h.notifyTurnCalls.find((t) => t.state === 'done')
    assert.ok(done, 'turn done notice emitted')
    assert.ok(!h.notifyPetCalls.some((c) => c.kind === 'chat'), 'no chat content forwarded')
  }

  /* 4. Re-injection guard — second run in the same page is a no-op. */
  {
    const before = typeof h.win.__DSH_DESKTOP__.play
    vm.runInContext(SRC, h.sandbox)
    assert.strictEqual(typeof h.win.__DSH_DESKTOP__.play, before, 're-injection keeps existing surface')
  }

  /* 5. Side rail tabs are injected into the page (pet toggle + theme settings). */
  {
    const rail = h.body.children.find((c) => c.id === 'ds-desk-tabs')
    assert.ok(rail, 'side rail injected')
    const petTab = rail.children.find((c) => c.id === 'ds-desk-pet-tab')
    assert.ok(petTab, 'pet toggle tab injected')
    const themeTab = rail.children.find((c) => c.id === 'ds-desk-theme-tab')
    assert.ok(themeTab, 'theme settings tab injected')
    assert.strictEqual(themeTab.textContent, '主题', 'theme tab labeled')
  }

  console.log('pet-inject: OK (tokens / approval / turn completion / re-injection guard / side rail tabs)')
}

main()
