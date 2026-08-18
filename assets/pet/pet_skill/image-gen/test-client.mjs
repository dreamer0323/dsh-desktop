#!/usr/bin/env node
/**
 * End-to-end test for the image-gen MCP server: spawns it, drives the MCP
 * handshake (initialize → initialized → tools/list → tools/call), and prints
 * the generated image result. Usage: node test-client.mjs
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const child = spawn(process.execPath, [join(here, 'server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] })

let nextId = 0
const pending = new Map()
let buf = ''
const responses = []

function rpc(method, params) {
  const id = ++nextId
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

child.stdout.on('data', (d) => {
  buf += String(d)
  let nl
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    responses.push(msg)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
  }
})

const MARISA_PROMPT =
  'masterpiece, best quality, anime style, 1girl, solo, (Kirisame Marisa:1.2), (Touhou Project:1.1), ' +
  'long blonde hair, side braid with a small white hair bow, yellow eyes, ' +
  'oversized black witch hat with a large white bow, (black vest with gold buttons:1.1), ' +
  'white blouse with puffy short sleeves, black skirt with white ruffled hem, ' +
  'white frilled waist apron, white thighhighs, black lace-up boots, ' +
  'holding a magic broom, (miniature hakkerou:1.1), standing, full body, facing viewer, waving, ' +
  'dynamic pose, simple soft background, bright lighting, cel shaded, vibrant colors'

try {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-client', version: '0' } })
  console.log('initialize →', init.serverInfo.name, init.protocolVersion)
  notify('notifications/initialized', {})
  const list = await rpc('tools/list', {})
  console.log('tools →', list.tools.map((t) => t.name).join(', '))
  const call = await rpc('tools/call', { name: 'generate_image', arguments: { prompt: MARISA_PROMPT, filename: 'marisa-pet.png' } })
  const texts = call.content.filter((c) => c.type === 'text').map((c) => c.text)
  const imgs = call.content.filter((c) => c.type === 'image')
  console.log('result →', texts.join(' '))
  console.log('image → mime=%s base64=%d bytes', imgs[0] && imgs[0].mimeType, imgs[0] && (imgs[0].data.length * 0.75).toFixed(0))
  console.log('MCP OK')
} catch (err) {
  console.error('MCP FAIL:', err.message)
  process.exitCode = 1
} finally {
  child.kill()
}
