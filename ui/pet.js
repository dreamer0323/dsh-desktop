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
