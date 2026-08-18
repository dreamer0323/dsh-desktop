#!/usr/bin/env node
/**
 * Minimal MCP image-generation server (stdio, zero deps).
 *
 * Exposes a single `generate_image` tool that renders a text-to-image prompt
 * through the free, key-less Pollinations.ai endpoint (FLUX / SDXL) and
 * returns the image (base64) plus a saved local file path.
 *
 * Run/register (project .mcp.json):
 *   { "mcpServers": { "image-gen": { "command": "node",
 *       "args": ["assets/pet/pet_skill/image-gen/server.mjs"] } } }
 */

import { createInterface } from 'node:readline'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const OUT_DIR = join(ROOT, 'image', 'gen')

const TOOL = {
  name: 'generate_image',
  description:
    '生成 AI 图像（免密钥，经 Pollinations.ai 调用 FLUX/SDXL）。' +
    '接受文生图提示词，返回 base64 图像与本地保存路径。用于生成角色立绘/桌宠素材等。',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '正向提示词（可含角色特征/动作/画风）。' },
      negative: { type: 'string', description: '负面提示词，可选。' },
      width: { type: 'number', description: '宽，默认 512。' },
      height: { type: 'number', description: '高，默认 768（全身竖构图）。' },
      model: { type: 'string', description: "默认 'flux'，可选 'turbo'/'sdxl'。" },
      seed: { type: 'number', description: '随机种子，可选；固定可复现。' },
      filename: { type: 'string', description: '保存文件名，默认自动生成。' },
    },
    required: ['prompt'],
  },
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function error(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } })
}

async function generateImage(params) {
  const p = params || {}
  if (!p.prompt) throw new Error('prompt is required')
  const width = Math.min(1024, Math.max(256, Number(p.width) || 512))
  const height = Math.min(1024, Math.max(256, Number(p.height) || 768))
  const model = ['flux', 'turbo', 'sdxl'].includes(p.model) ? p.model : 'flux'

  const url = new URL('https://image.pollinations.ai/prompt/' + encodeURIComponent(p.prompt))
  url.searchParams.set('width', String(width))
  url.searchParams.set('height', String(height))
  url.searchParams.set('model', model)
  url.searchParams.set('nologo', 'true')
  if (p.seed != null) url.searchParams.set('seed', String(p.seed))

  // Pollinations cold-starts uncached prompts: the first request often returns
  // an empty 200 while the image renders in the background. Retry with backoff
  // until a real image comes back (or we exhaust attempts).
  let buf = Buffer.alloc(0)
  let mime = 'image/jpeg'
  let lastStatus = 0
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url)
    lastStatus = res.status
    buf = Buffer.from(await res.arrayBuffer())
    if (res.ok && buf.length > 1000) {
      mime = res.headers.get('content-type') || mime
      break
    }
    await new Promise((r) => setTimeout(r, attempt * 2500))
  }
  if (buf.length < 1000) {
    throw new Error(`pollinations: no image after retries (http ${lastStatus}, ${buf.length}b)`)
  }
  const ext = mime.includes('png') ? '.png' : '.jpg'
  const filename = p.filename || `gen-${Date.now()}${ext}`
  const outPath = join(OUT_DIR, filename.replace(/[\\/:*?"<>|]/g, '_'))
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(outPath, buf)

  return {
    base64: buf.toString('base64'),
    mimeType: mime,
    width,
    height,
    path: outPath,
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

rl.on('line', async (line) => {
  line = line.trim()
  if (!line) return
  let msg
  try { msg = JSON.parse(line) } catch { return }

  if (msg.method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'image-gen', version: '1.0.0' },
      },
    })
  }
  if (msg.method === 'notifications/initialized' || msg.method === 'notifications/cancelled') return
  if (msg.method === 'ping') return send({ jsonrpc: '2.0', id: msg.id, result: {} })
  if (msg.method === 'tools/list') {
    return send({ jsonrpc: '2.0', id: msg.id, result: { tools: [TOOL] } })
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name
    const args = (msg.params && msg.params.arguments) || {}
    if (name !== 'generate_image') return error(msg.id, `unknown tool: ${name}`)
    try {
      const out = await generateImage(args)
      return send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [
            { type: 'text', text: `已生成图像并保存：${out.path}（${out.width}×${out.height}, ${out.mimeType}）` },
            { type: 'image', data: out.base64, mimeType: out.mimeType },
          ],
        },
      })
    } catch (err) {
      return error(msg.id, String((err && err.message) || err))
    }
  }
  return error(msg.id, `unsupported method: ${msg.method}`)
})

rl.on('error', () => process.exit(0))
process.stdin.on('end', () => process.exit(0))
