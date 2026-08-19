/*
 * Desktop pet v4 runtime (pet window) — static Marisa Fumo, no chat, no voice.
 *   - Stats / token pill (pushed by main)
 *   - Turn lifecycle → completion notice ("回答完毕") / error
 *   - Authorization takeover → red banner
 */
;(function () {
  'use strict'

  var bubble = document.getElementById('bubble')
  var bubbleText = document.getElementById('bubbleText')
  var statsPill = document.getElementById('statsPill')
  var tokenPill = document.getElementById('tokenPill')
  var tokenMini = document.getElementById('tokenMini')

  /* Effective pet image pushed by main (replacement lives in userData in
   * packaged builds, where the bundled <img src> would show the default). */
  if (window.pet && window.pet.onImage) {
    window.pet.onImage(function (uri) {
      var img = document.getElementById('fumo')
      if (img && uri) img.src = uri
    })
  }

  /* ── Pet click: play the user's sound (or a synth blip), with a bounce ──
   * The click sound is a global dsh-desktop asset pushed by main as a data:
   * URI (null = none set). A tiny WebAudio tone keeps clicks from being
   * silent when no file has been picked. */
  var petSound = null
  if (window.pet && window.pet.onSound) {
    window.pet.onSound(function (uri) {
      petSound = uri || null
      window.__petSoundSet = true // test hook
    })
  }

  var clickCtx = null
  function synthBlip() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      if (!clickCtx) clickCtx = new AC()
      if (clickCtx.state === 'suspended') clickCtx.resume()
      var t = clickCtx.currentTime
      var o = clickCtx.createOscillator()
      var g = clickCtx.createGain()
      o.type = 'triangle'
      o.frequency.setValueAtTime(880, t)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
      o.connect(g)
      g.connect(clickCtx.destination)
      o.start(t)
      o.stop(t + 0.16)
    } catch (err) { /* ignore */ }
  }

  function onPetClick() {
    window.__petClickCount = (window.__petClickCount || 0) + 1 // test hook
    var mascot = document.getElementById('mascot')
    if (mascot) {
      mascot.classList.remove('clicked')
      void mascot.offsetWidth // restart the animation
      mascot.classList.add('clicked')
    }
    if (petSound) {
      try { var a = new Audio(petSound); a.volume = 0.9; void a.play() } catch (err) { synthBlip() }
    } else {
      synthBlip()
    }
  }

  /* Drag-vs-click discrimination. Dragging the pet moves the window via
   * window.pet.drag (IPC); a press without movement on the fumo image is a
   * click. The click zone hugs the image (not the whole transparent window). */
  function isOnPetImage(x, y) {
    var img = document.getElementById('fumo')
    if (!img) return false
    var r = img.getBoundingClientRect()
    var pad = 8 // small tolerance so the edge isn't finicky
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
  }

  var dragState = null
  document.addEventListener('mousedown', function (e) {
    dragState = { x: e.screenX, y: e.screenY, moved: false, onPet: isOnPetImage(e.clientX, e.clientY) }
  })
  document.addEventListener('mousemove', function (e) {
    if (!dragState) return
    var dx = e.screenX - dragState.x
    var dy = e.screenY - dragState.y
    if (Math.abs(dx) + Math.abs(dy) > 4) dragState.moved = true
    if (dragState.moved && window.pet && window.pet.drag) {
      window.pet.drag(dx, dy)
      dragState.x = e.screenX
      dragState.y = e.screenY
    }
  })
  document.addEventListener('mouseup', function () {
    if (!dragState) return
    var wasDrag = dragState.moved
    var wasOnPet = dragState.onPet
    dragState = null
    if (!wasDrag && wasOnPet) onPetClick()
  })

  /* Mouse pass-through (hit test): the transparent window starts with
   * setIgnoreMouseEvents(true, {forward:true}) so clicks on the empty margins
   * fall through to the app underneath. This listener re-enables capture the
   * moment the cursor is over an interactive element (the pet image / bubble /
   * pills / auth banner) and hands it back when it leaves them — the hit area
   * therefore hugs the image instead of the whole 300x400 window. */
  var INTERACTIVE = '.mascot, .status-bar, .bubble, .auth-banner'
  var mouseIgnored = true
  document.addEventListener('mousemove', function (e) {
    if (!window.pet || !window.pet.setIgnoreMouse) return
    var el = document.elementFromPoint(e.clientX, e.clientY)
    var interactive = !!(el && el.closest && el.closest(INTERACTIVE))
    window.__petMouseCapture = interactive // test hook
    var wantIgnored = !interactive
    if (wantIgnored !== mouseIgnored) {
      mouseIgnored = wantIgnored
      window.pet.setIgnoreMouse(mouseIgnored)
    }
  }, true)

  var authBanner = null
  var lastTokens = null

  /* Feature toggles pushed by main (pet:config). */
  var CFG = { tokens: true, notify: true }
  if (window.pet && window.pet.onConfig) {
    window.pet.onConfig(function (c) {
      if (!c) return
      CFG.tokens = typeof c.tokens === 'boolean' ? c.tokens : CFG.tokens
      CFG.notify = typeof c.notify === 'boolean' ? c.notify : CFG.notify
      if (!CFG.tokens) {
        tokenPill.hidden = true
        tokenMini.hidden = true
        document.getElementById('statusBar').hidden = true
      }
    })
  }

  /* ── Bubble ──────────────────────────────────────────────────────── */
  var hideTimer = null
  function showBubble(text, autoMs, cls) {
    bubbleText.textContent = text
    bubble.className = 'bubble' + (cls ? ' ' + cls : '')
    bubble.hidden = false
    if (hideTimer) clearTimeout(hideTimer)
    if (autoMs) hideTimer = setTimeout(hideBubble, autoMs)
  }
  function hideBubble() {
    bubble.hidden = true
    bubble.className = 'bubble'
    hideTimer = null
  }

  /* ── Stats bridge ────────────────────────────────────────────────── */
  if (window.pet && window.pet.onStats) {
    window.pet.onStats(function (s) {
      if (!s) return
      statsPill.textContent = '内存 ' + s.mem + '% · CPU ' + s.cpu + '%'
    })
  }

  /* ── Token display ───────────────────────────────────────────────── */
  function fmtTokens(v) {
    if (v == null) return '--'
    return v < 1000 ? String(v) : (v / 1000).toFixed(1) + 'K'
  }
  function setTokens(u) {
    lastTokens = u
    if (!u) return
    document.getElementById('statusBar').hidden = false
    tokenPill.textContent = 'tokens 输入 ' + fmtTokens(u.input) + ' · 输出 ' + fmtTokens(u.output)
    tokenMini.textContent = '⚡ ' + fmtTokens(u.input) + ' / ' + fmtTokens(u.output)
    tokenMini.hidden = false
  }

  /* ── Auth alert banner ───────────────────────────────────────────── */
  function showAuthBanner(info) {
    if (!authBanner) {
      authBanner = document.createElement('div')
      authBanner.className = 'auth-banner'
      var label = document.createElement('span')
      label.className = 'auth-label'
      var closeBtn = document.createElement('button')
      closeBtn.className = 'auth-close'
      closeBtn.textContent = '知道了'
      closeBtn.addEventListener('click', function () { if (authBanner) { authBanner.remove(); authBanner = null } })
      authBanner.appendChild(label)
      authBanner.appendChild(closeBtn)
      document.body.appendChild(authBanner)
    }
    authBanner.querySelector('.auth-label').textContent =
      '需要你确认：' + (info && info.reason ? info.reason : 'agent 请求授权')
    showBubble('喂！有操作需要你确认，别发呆だぜ！', 8000, 'bubble--auth')
  }
  function hideAuthBanner() {
    if (authBanner) { authBanner.remove(); authBanner = null }
    hideBubble()
  }

  /* ── Event bridge (tokens / auth) ────────────────────────────────── */
  if (window.pet && window.pet.onEvent) {
    window.pet.onEvent(function (ev) {
      if (!ev || !ev.kind) return
      if (ev.kind === 'tokens') {
        if (CFG.tokens) setTokens(ev)
      } else if (ev.kind === 'auth') {
        if (CFG.notify) {
          if (ev.pending) showAuthBanner(ev)
          else hideAuthBanner()
        }
      }
    })
  }

  /* ── Turn-lifecycle bridge (completion notice / error) ───────────── */
  if (window.pet && window.pet.onTurn) {
    window.pet.onTurn(function (t) {
      if (!t || !t.state || !CFG.notify) return
      if (t.state === 'done') {
        showBubble('回答完毕', 3000)
      } else if (t.state === 'error') {
        showBubble('生成出错了…', 5000)
      }
    })
  }
})()
