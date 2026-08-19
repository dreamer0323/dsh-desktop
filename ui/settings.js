/*
 * Theme settings UI. Talks to the main process through window.dshTheme
 * (exposed by src/preload-settings.js). Editing flows:
 *   - 外观参数：friendly color/number fields + advanced JSON editor.
 *   - 素材替换：native file pickers for images / sounds / pet image.
 * Saving expands the friendly values back to the full token dictionary
 * (mirroring src/theme-params.js mergeParams) and re-renders the theme.
 */
;(function () {
  'use strict'

  var $ = function (id) { return document.getElementById(id) }

  var schema = null
  var state = {
    current: null,   // theme name being edited
    active: null,    // theme name currently applied
    displayName: '',
    friendly: {},    // friendly form values (key → value)
  }

  /* ── Toast ─────────────────────────────────────────────────────────── */
  var toastTimer = null
  function toast(msg, isError) {
    var el = $('toast')
    el.textContent = msg
    el.className = 'toast' + (isError ? ' error' : '')
    el.hidden = false
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.hidden = true }, isError ? 5000 : 2600)
  }

  function normalizeHex(v) {
    v = String(v || '').trim()
    if (!/^#?[0-9a-f]{3}$/i.test(v) && !/^#?[0-9a-f]{6}$/i.test(v)) return null
    v = v.replace(/^#?/, '#')
    if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
    return v.toLowerCase()
  }

  /* ── Theme list ────────────────────────────────────────────────────── */
  async function refreshList() {
    var themes = await window.dshTheme.list()
    var list = $('themeList')
    list.textContent = ''
    for (var item of themes) {
      var card = buildThemeCard(item)
      list.appendChild(card)
    }
  }

  function buildThemeCard(t) {
    var card = document.createElement('div')
    card.className = 'theme-card' + (t.active ? ' active' : '')
    card.title = '编辑 ' + t.name
    var name = document.createElement('span')
    name.className = 'tname'
    name.textContent = t.name
    var disp = document.createElement('span')
    disp.className = 'tdisp'
    disp.textContent = t.displayName || ''
    card.appendChild(name)
    card.appendChild(disp)
    if (t.active) {
      var badge = document.createElement('span')
      badge.className = 'badge'
      badge.textContent = '当前'
      card.appendChild(badge)
    }
    card.addEventListener('click', function (name) { return function () { void loadTheme(name) } }(t.name))

    var del = document.createElement('button')
    del.className = 'del'
    del.textContent = '✕'
    del.title = '删除主题'
    del.addEventListener('click', function (name, ev) {
      ev.stopPropagation()
      void deleteTheme(name)
    }.bind(null, t.name))
    card.appendChild(del)
    return card
  }

  /* ── Load / edit a theme ───────────────────────────────────────────── */
  async function loadTheme(name) {
    var data = await window.dshTheme.read(name)
    if (!data) { toast('主题不存在：' + name, true); return }
    state.current = name
    state.active = data.active
    state.jsonParams = data.params || {}
    state.friendly = {}
    for (var f of schema.fields) {
      var v = (data.params || {})[f.key]
      state.friendly[f.key] = v !== undefined ? v : schema.defaults[f.key]
    }
    renderEditor(data)
    $('saveBtn').disabled = false
    void refreshList()
  }

  function renderEditor(data) {
    var content = $('content')
    var html = ''
    html += '<div class="editor-head">'
    html += '  <h2 class="tname">' + data.name + '</h2>'
    html += '  <label class="disp-label">显示名 <input id="displayName" class="text" style="width:130px" spellcheck="false" /></label>'
    html += (data.active ? '  <span class="badge">当前生效</span>' : '')
    html += '  <span class="spacer"></span>'
    html += '  <button id="setActiveBtn" class="btn">设为当前</button>'
    html += '  <button id="resetBtn" class="btn">恢复默认参数</button>'
    html += '  <button id="deleteBtn" class="btn btn-danger">删除主题</button>'
    html += '</div>'
    html += '<section class="section"><div id="paramForm"></div></section>'
    html += '<section class="section"><h3>素材替换</h3><div class="assets-grid" id="assetGrid"></div></section>'
    content.innerHTML = html

    $('displayName').value = data.displayName || data.name

    $('setActiveBtn').addEventListener('click', function () { void setActiveTheme(data.name) })
    $('resetBtn').addEventListener('click', function () { resetDefaults() })
    $('deleteBtn').addEventListener('click', function () { void deleteTheme(data.name) })

    renderParamsForm()
    renderAssets(data.assets)
  }

  /* ── Param form ────────────────────────────────────────────────────── */
  function renderParamsForm() {
    var groups = []
    for (var f of schema.fields) {
      var g = groups.find(function (g) { return g.key === f.group })
      if (!g) { g = { key: f.group, fields: [] }; groups.push(g) }
      g.fields.push(f)
    }
    var html = ''
    for (var group of groups) {
      html += '<h3>' + escapeHtml(group.key) + '</h3><div class="grid">'
      for (var f of group.fields) {
        var val = state.friendly[f.key]
        if (f.type === 'number') {
          html += '<div class="field"><label>' + escapeHtml(f.label) + '</label>' +
            '<input type="range" class="range" data-key="' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + val + '" />' +
            '<span class="range-val" id="val-' + f.key + '">' + val + '</span></div>'
        } else {
          html += '<div class="field"><label>' + escapeHtml(f.label) + '</label>' +
            '<input type="color" data-key="' + f.key + '" value="' + val + '" />' +
            '<input type="text" class="hex" data-key="' + f.key + '" value="' + val + '" spellcheck="false" /></div>'
        }
      }
      html += '</div>'
    }
    html += '<details class="advanced"><summary>完整参数（JSON，可选）</summary>' +
      '<textarea id="paramsJson" class="textbox" spellcheck="false"></textarea></details>'
    $('paramForm').innerHTML = html

    // Bind inputs.
    for (var f of schema.fields) {
      var inputs = document.querySelectorAll('[data-key="' + f.key + '"]')
      if (f.type === 'number') {
        var range = inputs[0]
        range.addEventListener('input', function (key, el) {
          state.friendly[key] = Number(el.value)
          $('val-' + key).textContent = el.value
        }.bind(null, f.key, range))
      } else {
        var color = inputs[0]
        var hex = inputs[1]
        color.addEventListener('input', function (key, hexEl) {
          var v = normalizeHex(color.value)
          if (!v) return
          state.friendly[key] = v
          hexEl.value = v
        }.bind(null, f.key, hex))
        hex.addEventListener('input', function (key, colorEl) {
          var v = normalizeHex(hex.value)
          if (!v) return
          colorEl.value = v
          state.friendly[key] = v
        }.bind(null, f.key, color))
      }
    }

    $('paramsJson').value = JSON.stringify(currentParamsJson(), null, 2)
  }

  function currentParamsJson() {
    // Rebuild from the last saved manifest if available.
    return state.jsonParams || {}
  }

  function resetDefaults() {
    for (var f of schema.fields) state.friendly[f.key] = schema.defaults[f.key]
    renderParamsForm()
    toast('已恢复为默认参数，点击「保存并应用」生效')
  }

  /* ── Asset slots ───────────────────────────────────────────────────── */
  function renderAssets(assets) {
    var grid = $('assetGrid')
    grid.textContent = ''
    for (var a of assets) {
      var card = document.createElement('div')
      card.className = 'asset-card'
      card.dataset.slot = a.slot

      var label = document.createElement('div')
      label.className = 'a-label'
      label.textContent = a.label
      if (a.kind === 'image' && !a.used) {
        var unused = document.createElement('span')
        unused.className = 'unused'
        unused.textContent = '未使用'
        label.appendChild(unused)
      }
      card.appendChild(label)

      var preview = document.createElement('div')
      preview.className = 'a-preview'
      if (a.kind === 'image') {
        if (a.dataUri) {
          var img = document.createElement('img')
          img.src = a.dataUri
          img.alt = a.rel
          preview.appendChild(img)
        } else {
          var none = document.createElement('span')
          none.className = 'none'
          none.textContent = '未设置'
          preview.appendChild(none)
        }
      } else {
        if (a.dataUri) {
          var audio = document.createElement('audio')
          audio.controls = true
          audio.preload = 'none'
          audio.src = a.dataUri
          preview.appendChild(audio)
        } else {
          var none2 = document.createElement('span')
          none2.className = 'none'
          none2.textContent = '使用合成音'
          preview.appendChild(none2)
        }
      }
      card.appendChild(preview)

      var rel = document.createElement('div')
      rel.className = 'a-rel'
      rel.textContent = a.rel || ''
      card.appendChild(rel)

      var actions = document.createElement('div')
      actions.className = 'a-actions'
      var pick = document.createElement('button')
      pick.className = 'btn btn-small'
      pick.textContent = a.kind === 'sound' ? '选择音频' : '选择图片'
      pick.addEventListener('click', function (a, btn) {
        return function () { void pickAsset(a, btn) }
      }(a, pick))
      actions.appendChild(pick)
      card.appendChild(actions)

      grid.appendChild(card)
    }
  }

  async function pickAsset(slotInfo, btn) {
    btn.disabled = true
    try {
      var res
      if (slotInfo.slot === 'pet') res = await window.dshTheme.pickPet()
      else if (slotInfo.slot === 'pet-sound') res = await window.dshTheme.pickPetSound()
      else res = await window.dshTheme.pickAsset(state.current, slotInfo.slot, slotInfo.kind)
      if (res) {
        var card = document.querySelector('.asset-card[data-slot="' + slotInfo.slot + '"]')
        if (card) {
          // Refresh just this card (keep unsaved param edits intact).
          var fresh = (await window.dshTheme.read(state.current)).assets.find(function (a) { return a.slot === slotInfo.slot })
          if (fresh) card.replaceWith(buildAssetCard(fresh))
        }
        var label = { pet: '宠物形象已替换', 'pet-sound': '宠物点击音效已替换' }[slotInfo.slot] ||
          '素材已替换' + (state.active ? '并应用' : '')
        toast(label)
      }
    } catch (err) {
      toast('替换失败：' + (err.message || err), true)
    } finally {
      btn.disabled = false
    }
  }

  function buildAssetCard(a) {
    var card = document.createElement('div')
    card.className = 'asset-card'
    card.dataset.slot = a.slot
    var label = document.createElement('div')
    label.className = 'a-label'
    label.textContent = a.label
    if (a.kind === 'image' && !a.used) {
      var unused = document.createElement('span')
      unused.className = 'unused'
      unused.textContent = '未使用'
      label.appendChild(unused)
    }
    card.appendChild(label)
    var preview = document.createElement('div')
    preview.className = 'a-preview'
    if (a.kind === 'image') {
      if (a.dataUri) { var img = document.createElement('img'); img.src = a.dataUri; img.alt = a.rel; preview.appendChild(img) }
      else { var n = document.createElement('span'); n.className = 'none'; n.textContent = '未设置'; preview.appendChild(n) }
    } else {
      if (a.dataUri) { var au = document.createElement('audio'); au.controls = true; au.preload = 'none'; au.src = a.dataUri; preview.appendChild(au) }
      else { var n2 = document.createElement('span'); n2.className = 'none'; n2.textContent = '使用合成音'; preview.appendChild(n2) }
    }
    card.appendChild(preview)
    var rel = document.createElement('div'); rel.className = 'a-rel'; rel.textContent = a.rel || ''; card.appendChild(rel)
    var actions = document.createElement('div'); actions.className = 'a-actions'
    var pick = document.createElement('button'); pick.className = 'btn btn-small'
    pick.textContent = a.kind === 'sound' ? '选择音频' : '选择图片'
    pick.addEventListener('click', function () { void pickAsset(a, pick) })
    actions.appendChild(pick); card.appendChild(actions)
    return card
  }

  /* ── Save ──────────────────────────────────────────────────────────── */
  async function saveTheme() {
    if (!state.current) return
    var displayName = ($('displayName') && $('displayName').value.trim()) || state.current
    var jsonRaw = $('paramsJson') ? $('paramsJson').value : ''
    var jsonParams = {}
    if (jsonRaw && jsonRaw.trim()) {
      try { jsonParams = JSON.parse(jsonRaw) } catch (err) {
        toast('高级 JSON 解析失败：' + err.message, true)
        return
      }
    }
    var expanded = await window.dshTheme.expand(state.friendly)
    // Preserve custom (non-friendly, non-derived) JSON overrides.
    var extras = {}
    for (var k of Object.keys(jsonParams)) {
      if (schema.friendlyKeys.indexOf(k) === -1 && !(k in expanded)) extras[k] = jsonParams[k]
    }
    var finalParams = Object.assign({}, expanded, extras)
    state.jsonParams = finalParams
    await window.dshTheme.save(state.current, displayName, finalParams)
    var wasActive = state.active
    toast(wasActive ? '已保存并应用 ✓' : '已保存（此主题当前未启用）')
    void refreshList()
    // Keep the JSON editor in sync with what was actually written.
    if ($('paramsJson')) $('paramsJson').value = JSON.stringify(finalParams, null, 2)
  }

  /* ── Theme lifecycle ───────────────────────────────────────────────── */
  async function createTheme() {
    var name = $('newThemeName').value.trim()
    if (!name) { toast('请输入主题名', true); return }
    try {
      var created = await window.dshTheme.create(name, name)
      toast('主题已创建：' + created.name)
      $('newThemeName').value = ''
      await window.dshTheme.setActive(created.name)
      await refreshList()
      await loadTheme(created.name)
    } catch (err) {
      toast('创建失败：' + (err.message || err), true)
    }
  }

  async function setActiveTheme(name) {
    try {
      await window.dshTheme.setActive(name)
      state.active = name
      toast('已切换为当前主题并应用')
      void refreshList()
    } catch (err) {
      toast('切换失败：' + (err.message || err), true)
    }
  }

  async function deleteTheme(name) {
    if (!window.confirm('确定删除主题「' + name + '」？该操作不可撤销。')) return
    try {
      await window.dshTheme.remove(name)
      toast('已删除主题：' + name)
      if (state.current === name) {
        state.current = null
        $('content').innerHTML = '<div class="empty">← 从左侧选择一个主题</div>'
        $('saveBtn').disabled = true
      }
      void refreshList()
    } catch (err) {
      toast('删除失败：' + (err.message || err), true)
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  /* ── Boot ──────────────────────────────────────────────────────────── */
  async function boot() {
    schema = await window.dshTheme.schema()
    $('createBtn').addEventListener('click', function () { void createTheme() })
    $('newThemeName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') void createTheme()
    })
    $('saveBtn').addEventListener('click', function () { void saveTheme() })

    try {
      await refreshList()
      var themes = await window.dshTheme.list()
      if (themes.length) {
        var active = themes.find(function (t) { return t.active }) || themes[0]
        await loadTheme(active.name)
      }
    } catch (err) {
      toast('初始化失败：' + (err.message || err), true)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { void boot() })
  } else {
    void boot()
  }
})()
