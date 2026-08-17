/*
 * Marisa theme runtime — injected into the dsh web page by src/theme.js.
 * 1. Stamps body[data-ds-marisa] so the theme stylesheet applies.
 * 2. Owns the event-audio manager (placeholder WebAudio synth; see below).
 *
 * ── Replacing placeholder sounds with real Marisa voice/sfx ────────────
 * Drop audio into assets/themes/marisa/sounds/ named click/hover/complete/
 * error (any of .mp3/.wav/.ogg/.m4a). src/theme.js auto-detects them and
 * injects data: URIs as window.__DSH_THEME_SOUNDS__ before this script runs,
 * so real files play without a server; absent files fall back to WebAudio.
 */
;(function () {
  'use strict'

  if (document.body) document.body.setAttribute('data-ds-marisa', '')

  /* Real-file map (populated by src/theme.js as data: URIs, else null). */
  var FILES = (window.__DSH_THEME_SOUNDS__) || {
    click: null,    // button press
    hover: null,    // pointer enters a control
    complete: null, // generation finished (phase 4)
    error: null,    // failure (phase 4)
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

  /* Placeholder synth tones — replaced automatically when SOUND_FILES[name]
   * is set. Purely additive: no assets required. */
  var SYNTH = {
    click:    { type: 'triangle', freq: 880,  dur: 0.05, gain: 0.16 },
    hover:    { type: 'sine',     freq: 1320, dur: 0.03, gain: 0.06 },
    complete: { type: 'triangle', freq: 660,  dur: 0.2,  gain: 0.18 },
    error:    { type: 'sawtooth', freq: 220,  dur: 0.24, gain: 0.14 },
  }

  function synth(name) {
    var c = ctx()
    if (!c) return
    var s = SYNTH[name] || SYNTH.click
    var t = c.currentTime
    var osc = c.createOscillator()
    var gain = c.createGain()
    osc.type = s.type
    osc.frequency.setValueAtTime(s.freq, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(s.gain, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + s.dur)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(t)
    osc.stop(t + s.dur + 0.03)
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
    synth(name)
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

  /* Bridge for the desktop shell. */
  window.__DSH_DESKTOP__ = {
    play: play,
    notify: function (event) {
      if (!event || typeof event.type !== 'string') return
      play(event.type)
    },
  }

  /* ── Turn-lifecycle detection (powers the desktop pet) ──────────────
   * The assistant message root carries data-streaming for the whole running
   * turn (AssistantMarkdown ← AssistantNodeView data.status === 'running').
   * Watching its presence gives turn start/done without touching the harness.
   * Past durations feed a rolling estimate for "预计用时". */
  var turnRunning = false
  var turnStartAt = 0
  var recentDurations = []
  var MAX_RECENT = 8

  function hasStreaming() {
    return !!document.querySelector('[data-streaming]')
  }

  function estimateMs() {
    if (!recentDurations.length) return null
    var sum = 0
    for (var i = 0; i < recentDurations.length; i++) sum += recentDurations[i]
    return Math.round(sum / recentDurations.length)
  }

  function emitTurn(state, meta) {
    if (window.dsh && typeof window.dsh.notifyTurn === 'function') {
      window.dsh.notifyTurn({
        state: state,
        elapsedMs: meta.elapsedMs,
        estimateMs: meta.estimateMs,
      })
    }
    if (state === 'done') play('complete')
  }

  function turnStarted() {
    if (turnRunning) return
    turnRunning = true
    turnStartAt = Date.now()
    emitTurn('start', { estimateMs: estimateMs() })
  }

  function turnDone() {
    if (!turnRunning) return
    turnRunning = false
    var elapsed = Date.now() - turnStartAt
    if (elapsed > 500) {
      recentDurations.push(elapsed)
      if (recentDurations.length > MAX_RECENT) recentDurations.shift()
    }
    emitTurn('done', { elapsedMs: elapsed, estimateMs: estimateMs() })
  }

  function reconcileTurns() {
    var streaming = hasStreaming()
    if (streaming && !turnRunning) turnStarted()
    else if (!streaming && turnRunning) turnDone()
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
})()
