'use strict'

function byId(id) { return document.getElementById(id) }

var statusDot = byId('statusDot')
var statusText = byId('statusText')
var statusUrl = byId('statusUrl')
var logEl = byId('log')
var errorBox = byId('errorBox')
var errorText = byId('errorText')
var restartBtn = byId('restartBtn')
var quitBtn = byId('quitBtn')

var NL = String.fromCharCode(10)
var MAX_LINES = 400
var lines = []

function appendLog(line) {
  lines.push(line)
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
  logEl.textContent = lines.join(NL)
  logEl.scrollTop = logEl.scrollHeight
}

function setStatus(status) {
  status = status || { state: 'starting' }
  var state = status.state || 'starting'
  statusDot.className = 'dot ' + state

  if (state === 'starting') statusText.textContent = '正在启动服务…'
  else if (state === 'ready') statusText.textContent = '服务已就绪'
  else if (state === 'error') statusText.textContent = '启动失败'
  else if (state === 'stopped') statusText.textContent = '服务已停止'
  else statusText.textContent = state

  statusUrl.textContent = status.url || ''

  if (state === 'error') {
    errorBox.hidden = false
    var msg = status.message
    if (!msg && status.code != null) msg = '退出码 ' + status.code
    errorText.textContent = msg || '服务进程异常退出，请查看下方日志。'
  } else {
    errorBox.hidden = true
  }
}

function init() {
  window.dsh.onLog(appendLog)
  window.dsh.onStatus(setStatus)
  window.dsh.getState().then(function (state) {
    var logs = (state && state.logs) || []
    for (var i = 0; i < logs.length; i++) appendLog(logs[i])
    setStatus(state && state.status)
  })
  restartBtn.addEventListener('click', function () { window.dsh.restart() })
  quitBtn.addEventListener('click', function () { window.dsh.quit() })
}

init()
