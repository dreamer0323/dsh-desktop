/*
 * Theme runtime — injected into the dsh web page by src/theme.js.
 *  1. Stamps body[data-ds-<name>] so the theme stylesheet applies.
 *  2. Owns the event-audio manager (placeholder WebAudio synth; real files
 *     named click/hover/complete/error/auth in the theme's sounds/ are
 *     injected as data: URIs by src/theme.js).
 *  3. Powers the desktop pet v4 (lightweight):
 *       - turn completion → "回答完毕" notice
 *       - token usage read from the composer stats line → pet token pill
 *       - approval/authorization takeover panel → pet alert
 *       - right-edge "宠" tab → show/hide the pet
 *  4. Adds a right-edge "主题" tab that opens the theme settings window.
 *
 * Theme identity (name / displayName / accent colors) comes from
 * window.__DSH_THEME_CONFIG__ injected by src/theme.js; the CSS variables
 * --ds-theme-accent / --ds-theme-accent-soft / --ds-theme-accent-ink come
 * from the theme's template.css, so live theme swaps restyle the tabs without
 * re-injecting this script.
 *
 * The whole block is guarded so re-injection on dom-ready is a no-op.
 */
;(function () {
  'use strict'

  if (window.__DSH_DESKTOP__ && window.__DSH_DESKTOP__.__v2) return

  var CFG = window.__DSH_THEME_CONFIG__ || {}
  var themeName = CFG.name || 'marisa'
  var accent = CFG.accent || '#f6b93f'
  var accentSoft = CFG.accentSoft || '#ffd166'
  var accentInk = CFG.accentInk || '#241a08'

  if (document.body) document.body.setAttribute('data-ds-' + themeName, '')

  /* Real-file map (populated by src/theme.js as data: URIs, else null). */
  var FILES = (window.__DSH_THEME_SOUNDS__) || {
    click: null, hover: null, complete: null, error: null, auth: null,
  }

  var audioCtx = null
  function ctx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      audioCtx = new AC()
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
    return audioCtx
  }

  /* Placeholder synth tones — replaced automatically when FILES[name] is set. */
  var SYNTH = {
    click:    { type: 'triangle', freq: 880,  dur: 0.05, gain: 0.16 },
    hover:    { type: 'sine',     freq: 1320, dur: 0.03, gain: 0.06 },
    complete: { type: 'triangle', freq: 660,  dur: 0.2,  gain: 0.18 },
    error:    { type: 'sawtooth', freq: 220,  dur: 0.24, gain: 0.14 },
    auth:     { type: 'sine',     freq: 740,  dur: 0.12, gain: 0.18 },
  }

  function tone(type, freq, dur, gain) {
    var c = ctx()
    if (!c) return
    var t = c.currentTime
    var osc = c.createOscillator()
    var g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(c.destination)
    osc.start(t)
    osc.stop(t + dur + 0.03)
  }

  function play(name) {
    var src = FILES[name]
    if (src) {
      try {
        var a = new Audio(src)
        a.volume = name === 'hover' ? 0.5 : 1
        void a.play()
      } catch (e) { /* ignore */ }
      return
    }
    if (name === 'auth') {
      // attention: two-tone chime
      tone('sine', 740, 0.12, 0.16)
      setTimeout(function () { tone('sine', 990, 0.14, 0.14) }, 150)
      return
    }
    var s = SYNTH[name] || SYNTH.click
    tone(s.type, s.freq, s.dur, s.gain)
  }

  /* Autoplay unlock: create the context on the first user gesture. */
  window.addEventListener('pointerdown', function unlock() {
    ctx()
    window.removeEventListener('pointerdown', unlock)
  }, { passive: true })

  /* --- Event binding (delegation catches controls React mounts later) -- */
  var lastHover = 0
  document.addEventListener('mouseover', function (e) {
    var el = e.target && e.target.closest
      ? e.target.closest('button, [role="button"], a, summary')
      : null
    if (!el) return
    var now = Date.now()
    if (now - lastHover < 240) return
    lastHover = now
    play('hover')
  }, true)

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest
      ? e.target.closest('button, [role="button"], a, summary')
      : null
    if (!el) return
    play('click')
  }, true)

  /* ── Pet bridge helper ────────────────────────────────────────────── */
  function notifyPet(payload) {
    if (window.dsh && typeof window.dsh.notifyPet === 'function') {
      try { window.dsh.notifyPet(payload) } catch (err) { /* ignore */ }
    }
  }

  /* ── Turn completion detection (powers the "回答完毕" notice) ───────
   * The assistant message root carries data-streaming while a turn is
   * running. Watching its presence gives completion without reading content —
   * the pet only announces that the answer finished. */
  var turnRunning = false
  var turnStartAt = 0

  function hasStreaming() {
    return !!document.querySelector('[data-streaming]')
  }

  function turnDone() {
    if (!turnRunning) return
    turnRunning = false
    var elapsed = Date.now() - turnStartAt
    if (window.dsh && typeof window.dsh.notifyTurn === 'function') {
      window.dsh.notifyTurn({ state: 'done', elapsedMs: elapsed })
    }
    play('complete')
  }

  /* ── Token usage watcher ────────────────────────────────────────────
   * The composer stats line renders "输入 12.2K tok · 输出 3.4K tok" under
   * [data-composer-seat]. Read it periodically and forward changes. */
  var lastTokensLine = ''
  function parseTok(s) {
    var v = parseFloat(s)
    if (/K$/i.test(s)) v *= 1000
    else if (/M$/i.test(s)) v *= 1000000
    return Math.round(v)
  }

  function scanTokens() {
    var root = document.querySelector('[data-composer-seat]') ||
      document.querySelector('[data-composer-card]') || document.body
    var text = (root.innerText || root.textContent || '')
    var m = text.match(/(?:输入|Input)\s+([\d.]+[KM]?)\s*tok\s*·\s*(?:输出|Output)\s+([\d.]+[KM]?)\s*tok/i)
    if (m) {
      var line = m[0]
      if (line !== lastTokensLine) {
        lastTokensLine = line
        notifyPet({ kind: 'tokens', input: parseTok(m[1]), output: parseTok(m[2]) })
      }
    }
  }

  /* ── Approval / authorization watcher ───────────────────────────────
   * When the agent needs user approval, the composer is replaced by a
   * takeover panel rooted at [data-approval-key] (body [data-approval-scroll],
   * buttons 拒绝 / 允许一次). Presence toggles the pet alert. */
  var approvalSeen = false
  function scanApproval() {
    // data-* attributes first; a precise text marker as version-drift fallback,
    // scoped to the composer area (innerText on the whole SPA is expensive).
    var el = document.querySelector('[data-approval-key], [data-approval-scroll]')
    if (!el) {
      var seat = document.querySelector('[data-composer-seat], [data-composer-card]')
      var src = seat || document.body
      if (typeof src.innerText === 'string' && /等待审批|允许一次|Allow once/i.test(src.innerText)) el = src
    }
    var present = !!el
    if (present && !approvalSeen) {
      approvalSeen = true
      var reason = null
      var card = document.querySelector('[data-approval-scroll]')
      if (card) {
        var lines = (card.innerText || '').split('\n').map(function (s) { return s.trim() }).filter(Boolean)
        reason = lines[0] || null
      }
      notifyPet({ kind: 'auth', pending: true, reason: reason })
      play('auth')
    } else if (!present && approvalSeen) {
      approvalSeen = false
      notifyPet({ kind: 'auth', pending: false })
      play('complete')
    }
  }

  function reconcileTurns() {
    var streaming = hasStreaming()
    if (streaming && !turnRunning) {
      turnRunning = true
      turnStartAt = Date.now()
    } else if (!streaming && turnRunning) {
      turnDone()
    }
    scanApproval()
  }

  var mo = new MutationObserver(function () {
    setTimeout(reconcileTurns, 150)
  })
  if (document.body) {
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-streaming'],
    })
  }

  /* ── Desktop shell surface ────────────────────────────────────────── */
  window.__DSH_DESKTOP__ = {
    __v2: true,
    play: play,
    // Live theme switch: src/theme.js pushes the new sound map without
    // re-running this guarded block.
    setSounds: function (map) { FILES = map || FILES },
    notify: function (event) {
      if (!event || typeof event.type !== 'string') return
      play(event.type)
    },
  }

  /* ── Side rail tabs (pet toggle + theme settings) ────────────────────
   * A right-edge vertical rail lets the user quickly toggle the desktop pet
   * and open the theme settings. Colors follow the theme CSS variables
   * (--ds-theme-accent / -soft / -ink) so a live theme swap restyles them. */
  ;(function rail() {
    if (!document.body) return
    var style = document.createElement('style')
    style.textContent =
      '#ds-desk-tabs{position:fixed;right:0;top:50%;transform:translateY(-50%);' +
      'z-index:2147483646;display:flex;flex-direction:column;gap:6px;}' +
      '#ds-desk-tabs .tab{display:flex;flex-direction:column;align-items:center;gap:5px;' +
      'padding:12px 7px;border-radius:10px 0 0 10px;cursor:pointer;user-select:none;' +
      'background:var(--ds-theme-accent,' + accent + ');color:var(--ds-theme-accent-ink,' + accentInk + ');' +
      'font-size:15px;font-weight:700;box-shadow:-2px 2px 10px rgba(0,0,0,.35);' +
      'border:1px solid var(--ds-theme-accent-soft,' + accentSoft + ');border-right:none;' +
      'transition:opacity .2s;}' +
      '#ds-desk-tabs .tab .dot{width:7px;height:7px;border-radius:50%;background:#1d5b1d;' +
      'box-shadow:0 0 4px #3fbf3f;}' +
      '#ds-desk-tabs .tab.off{opacity:.45;}' +
      '#ds-desk-tabs .tab.off .dot{background:#7a1f1f;box-shadow:0 0 4px #ff5a5a;}' +
      '#ds-desk-tabs .tab:hover{opacity:1;}'
    ;(document.head || document.body).appendChild(style)

    var railEl = document.createElement('div')
    railEl.id = 'ds-desk-tabs'
    document.body.appendChild(railEl)

    // Pet toggle tab.
    var petTab = document.createElement('div')
    petTab.className = 'tab'
    petTab.id = 'ds-desk-pet-tab'
    petTab.innerHTML = '宠<span class="dot"></span>'
    petTab.title = '开关桌宠'
    railEl.appendChild(petTab)

    // Theme settings tab.
    var themeTab = document.createElement('div')
    themeTab.className = 'tab'
    themeTab.id = 'ds-desk-theme-tab'
    themeTab.textContent = '主题'
    themeTab.title = '打开主题设置'
    railEl.appendChild(themeTab)

    function setPetState(s) {
      var visible = !!(s && s.visible)
      petTab.classList.toggle('off', !visible)
      petTab.title = '开关桌宠（当前：' + (visible ? '开' : '关') + '）'
    }
    petTab.addEventListener('click', function () {
      if (window.dsh && window.dsh.togglePet) window.dsh.togglePet()
    })
    themeTab.addEventListener('click', function () {
      if (window.dsh && window.dsh.openThemeSettings) window.dsh.openThemeSettings()
    })
    if (window.dsh && window.dsh.onPetState) window.dsh.onPetState(setPetState)
    if (window.dsh && window.dsh.getPetState) {
      window.dsh.getPetState().then(setPetState).catch(function () {})
    }
  })()

  /* Token polling (starts after the app settles). */
  setTimeout(function () {
    scanTokens()
    setInterval(scanTokens, 4000)
  }, 2000)

  /* Approval polling — catches takeover panels even if a mutation was missed. */
  setInterval(scanApproval, 2000)
})()
