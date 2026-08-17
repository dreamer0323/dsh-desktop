/*
 * Desktop pet runtime (pet window). Two rendering modes:
 *   1. Sprite frames — drop your licensed Marisa art as
 *      assets/pet/<pose>-<n>.png and this cycles them per pose.
 *   2. Fallback mascot — the inline SVG/CSS witch hat + star (shown until
 *      frames exist; remove it by providing the frames).
 *
 * Stats and turn reminders arrive over the preload bridge (window.pet).
 */
;(function () {
  'use strict'

  /* ── Sprite sheet manifest ───────────────────────────────────────────
   * Frames live in assets/pet/ (relative to ui/, so ../assets/pet/).
   * idle-0.png … idle-3.png cycle as the resting animation; speak/happy are
   * short 2-frame loops. Adjust counts/fps to match your art. */
  var SPRITES = {
    idle:  { dir: '../assets/pet/', name: 'idle',  ext: '.png', count: 4, fps: 5 },
    speak: { dir: '../assets/pet/', name: 'speak', ext: '.png', count: 2, fps: 7 },
    happy: { dir: '../assets/pet/', name: 'happy', ext: '.png', count: 2, fps: 7 },
  }

  var mascotEl = document.getElementById('mascot')
  var mascotSvg = document.querySelector('.mascot-svg')
  var spriteEl = document.getElementById('sprite')
  var bubble = document.getElementById('bubble')
  var bubbleText = document.getElementById('bubbleText')
  var statsPill = document.getElementById('statsPill')

  var pose = 'idle'
  var frames = null
  var timer = null
  var frameIndex = 0
  var hideTimer = null

  function preloadPose(def) {
    return new Promise(function (resolve) {
      if (!def.count) return resolve([])
      var imgs = []
      var failed = false
      var pending = def.count
      for (var i = 0; i < def.count; i++) {
        var img = new Image()
        img.onload = function () { if (--pending === 0) resolve(failed ? null : imgs) }
        img.onerror = function () { failed = true; if (--pending === 0) resolve(null) }
        img.src = def.dir + def.name + '-' + i + def.ext
        imgs.push(img)
      }
    })
  }

  async function loadFrames() {
    var all = {}
    for (var name in SPRITES) {
      var f = await preloadPose(SPRITES[name])
      if (!f) return null
      all[name] = f
    }
    return all
  }

  function startSprite(all) {
    frames = all
    mascotSvg.style.display = 'none'
    spriteEl.hidden = false
    tick()
  }

  function startFallback() {
    // Keep the SVG mascot visible; frames are simply absent.
  }

  function tick() {
    if (!frames) return
    var def = SPRITES[pose]
    var imgs = frames[pose]
    frameIndex = (frameIndex + 1) % imgs.length
    spriteEl.style.backgroundImage = 'url("' + imgs[frameIndex].src + '")'
    timer = setTimeout(tick, 1000 / def.fps)
  }

  function setPose(p) {
    pose = SPRITES[p] ? p : 'idle'
    frameIndex = 0
  }

  function showBubble(text, autoMs) {
    bubbleText.textContent = text
    bubble.hidden = false
    if (hideTimer) clearTimeout(hideTimer)
    if (autoMs) hideTimer = setTimeout(hideBubble, autoMs)
  }

  function hideBubble() {
    bubble.hidden = true
    hideTimer = null
  }

  /* ── Stats bridge ─────────────────────────────────────────────────── */
  if (window.pet && window.pet.onStats) {
    window.pet.onStats(function (s) {
      if (!s) return
      statsPill.textContent = '内存 ' + s.mem + '% · CPU ' + s.cpu + '%'
    })
  }

  /* ── Turn-lifecycle bridge (phase 4) ───────────────────────────────── */
  if (window.pet && window.pet.onTurn) {
    window.pet.onTurn(function (t) {
      if (!t || !t.state) return
      if (t.state === 'start') {
        setPose('speak')
        var est = t.estimateMs != null ? '（预计 ' + (t.estimateMs / 1000).toFixed(0) + 's）' : ''
        showBubble('开始生成…' + est)
      } else if (t.state === 'done') {
        setPose('happy')
        var secs = t.elapsedMs != null ? (t.elapsedMs / 1000).toFixed(1) + 's' : '--'
        showBubble('生成完成～ 用时 ' + secs, 5000)
        setTimeout(function () { setPose('idle') }, 5200)
      } else if (t.state === 'error') {
        setPose('speak')
        showBubble('生成出错了…', 5000)
      }
    })
  }

  loadFrames().then(function (all) {
    if (all) startSprite(all)
    else startFallback()
  })
})()
