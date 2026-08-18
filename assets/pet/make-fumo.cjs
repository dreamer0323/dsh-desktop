'use strict'

/*
 * 处理 marisa-fumo 素材：把 image/marisa-fumo.webp 转成透明 PNG（边缘泛洪去背景）
 * 放到 assets/pet/marisa-fumo.png，供静态桌宠使用。
 * 依赖：harness 里的 sharp。用法：node make-fumo.cjs
 */

const path = require('node:path')
const { createRequire } = require('node:module')
const require_ = createRequire(__dirname)
const sharp = require_('D:/dev/agent/dsh/deepseek-harness/node_modules/.pnpm/sharp@0.35.3_@types+node@22.20.0/node_modules/sharp')

const SRC = path.join(__dirname, '..', '..', 'image', 'marisa-fumo.webp')
const OUT = path.join(__dirname, 'marisa-fumo.png')
const THRESHOLD = 42

/** 边缘泛洪去背景：从四条边框出发，移除与背景色接近且连通的像素。 */
function removeBackground({ data, info }) {
  const w = info.width
  const h = info.height
  const c = info.channels

  // 背景色：四角平均
  function px(x, y) {
    const i = (y * w + x) * c
    return [data[i], data[i + 1], data[i + 2]]
  }
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)]
  const bg = [0, 1, 2].map((k) => Math.round(corners.reduce((s, p) => s + p[k], 0) / 4))

  function nearBg(r, g, b) {
    const d = (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2
    return d < THRESHOLD * THRESHOLD
  }

  const visited = new Uint8Array(w * h)
  const stack = []
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }

  function push(x, y) {
    const idx = y * w + x
    if (visited[idx]) return
    const i = idx * c
    if (data[i + 3] < 128) { visited[idx] = 1; return }
    if (!nearBg(data[i], data[i + 1], data[i + 2])) return
    visited[idx] = 1
    stack.push(idx)
  }

  while (stack.length) {
    const idx = stack.pop()
    const x = idx % w
    const y = (idx - x) / w
    data[idx * c + 3] = 0
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }
  return data
}

;(async function main() {
  const meta = await sharp(SRC).metadata()
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true })
  const cleaned = removeBackground({ data, info })
  await sharp(cleaned, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toFile(OUT)

  // 验证：非透明像素包围盒 + 覆盖率
  let cnt = 0, minX = info.width, minY = info.height, maxX = 0, maxY = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (cleaned[(y * info.width + x) * info.channels + 3] > 20) {
        cnt++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const cov = ((cnt / (info.width * info.height)) * 100).toFixed(1)
  console.log('fumo: ' + meta.width + 'x' + meta.height + ' → bbox x[' + minX + '..' + maxX + '] y[' + minY + '..' + maxY + '] coverage ' + cov + '%')
  console.log('saved →', OUT)
})().catch((err) => {
  console.error('make-fumo failed:', err.message)
  process.exit(1)
})
