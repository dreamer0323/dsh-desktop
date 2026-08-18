'use strict'

/*
 * 魔理沙关键帧生成器（Muse Dash 合作风） —— 个人学习用同人素材（非商用）。
 *
 * 参考 Muse Dash × 东方合作版的魔理沙形象，强化辨识点：
 *   - Q 版大头身比 · 粗描边 · 大眼星芒高光 · 高饱和金发
 *   - 及腰蓬松金色双马尾（发尾系红色缎带蝴蝶结）—— 最醒目轮廓
 *   - 黑色魔女帽（白色帽带 + 金星）· 黑色连衣裙 + 白色围裙
 *   - 白色泡泡袖 · 衣领红色蝴蝶结 · 深紫眼睛
 *
 * 调色参考 assets/pet/../themes/marisa/images 主题部件与 ./image 下参考图。
 * 按 assets/pet/README.md 结构生成：
 *   idle-0..3.png   待机 4 帧（5fps）
 *   speak-0..1.png  说话 2 帧（7fps）
 *   happy-0..1.png  开心 2 帧（7fps）
 *
 * 用法：node make-frames.cjs        # 平滑矢量渲染
 *       node make-frames.cjs pixel  # 近邻下采样，输出像素化风格
 * 依赖：harness 里的 sharp（自带 librsvg 渲染 SVG）。
 */

const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const require_ = createRequire(__dirname)
const SHARP = 'D:/dev/agent/dsh/deepseek-harness/node_modules/.pnpm/sharp@0.35.3_@types+node@22.20.0/node_modules/sharp'
const sharp = require_(SHARP)

const W = 240
const H = 280
// 默认输出像素画；`node make-frames.cjs smooth` 输出平滑矢量版
const PIXEL = process.argv[2] !== 'smooth'

/* ── 像素画：16 色调色板（Marisa 配色） ──────────────────────────────── */
const PALETTE = [
  [49, 43, 74],   // black #312b4a
  [28, 23, 48],   // blackEdge #1c1730
  [74, 65, 102],  // blackHi #4a4166
  [255, 210, 63], // hair #ffd23f
  [255, 233, 133],// hairLight #ffe985
  [201, 138, 31], // hairDark #c98a1f
  [255, 233, 205],// skin #ffe9cd
  [238, 190, 146],// skinEdge #eebe92
  [91, 58, 143],  // eye #5b3a8f
  [59, 35, 92],   // eyeDark #3b235c
  [255, 253, 246],// white #fffdf6
  [227, 221, 202],// whiteEdge #e3ddca
  [255, 93, 110], // red #ff5d6e
  [223, 61, 80],  // redDark #df3d50
  [255, 194, 62], // gold #ffc23e
  [217, 130, 43], // goldDark #d9822b
]

function nearestPalette(r, g, b) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < PALETTE.length; i++) {
    const dr = PALETTE[i][0] - r
    const dg = PALETTE[i][1] - g
    const db = PALETTE[i][2] - b
    const d = dr * dr + dg * dg + db * db
    if (d < bestD) { bestD = d; best = i }
  }
  return PALETTE[best]
}

/* ── 配色（Muse Dash 合作风，参考主题部件 + 参考图主色） ───────────── */
const C = {
  hair: '#ffd23f', hairEdge: '#dfa62c', hairLight: '#ffe985', hairDark: '#c98a1f',
  skin: '#ffe9cd', skinEdge: '#eebe92',
  eye: '#5b3a8f', eyeDark: '#3b235c', eyeHi: '#ffffff', eyeStar: '#ffe9a8',
  blush: '#ff9d9d',
  mouth: '#b5483a', tongue: '#ffb0c0',
  black: '#312b4a', blackEdge: '#1c1730', blackHi: '#4a4166',
  white: '#fffdf6', whiteEdge: '#e3ddca',
  apron: '#fbfaf2', apronEdge: '#ded8c2',
  red: '#ff5d6e', redDark: '#df3d50', redHi: '#ff97a2',
  gold: '#ffc23e', goldHi: '#ffe08a', goldDark: '#d9822b',
  band: '#fffdf6',
}

/* ── 小工具 ─────────────────────────────────────────────────────────── */

function star5(cx, cy, r) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}

function sparkle(x, y, s, op) {
  const r = s
  return `
    <g transform="translate(${x} ${y})" opacity="${op}">
      <path d="M0 ${-r} L ${r * 0.3} ${-r * 0.3} L ${r} 0 L ${r * 0.3} ${r * 0.3} L 0 ${r}
               L ${-r * 0.3} ${r * 0.3} L ${-r} 0 L ${-r * 0.3} ${-r * 0.3} Z"
            fill="${C.goldHi}" stroke="${C.gold}" stroke-width="1.2"/>
      <circle cx="0" cy="0" r="${r * 0.25}" fill="#fffdf6"/>
    </g>`
}

function star(x, y, s, op = 0.9) {
  return `<path d="M${star5(x, y, s)}" fill="${C.goldHi}" stroke="${C.gold}" stroke-width="1.5"
             stroke-linejoin="round" opacity="${op}"/>`
}

/* ── 基础部件 ───────────────────────────────────────────────────────── */

function twinTails(tailSwing) {
  const dx = tailSwing
  const l = () => `
    <g transform="translate(${dx} 0)">
      <path d="M78 66 C 44 84, 26 126, 40 168 C 48 192, 74 196, 76 170 C 78 144, 82 110, 92 96 Z"
            fill="${C.hair}" stroke="${C.hairEdge}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M62 100 C 48 124, 44 152, 52 172 C 58 178, 66 172, 62 158 C 56 136, 60 116, 70 100 Z"
            fill="${C.hairLight}" opacity="0.55"/>
      <!-- 发尾红缎带蝴蝶结 -->
      <path d="M46 184 L 36 176 L 38 192 Z" fill="${C.red}" stroke="${C.redDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M46 184 L 56 176 L 54 192 Z" fill="${C.red}" stroke="${C.redDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="46" cy="184" r="5" fill="${C.redDark}"/>
    </g>`
  const r = () => `
    <g transform="translate(${dx} 0)">
      <path d="M162 66 C 196 84, 214 126, 200 168 C 192 192, 166 196, 164 170 C 162 144, 158 110, 148 96 Z"
            fill="${C.hair}" stroke="${C.hairEdge}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M178 100 C 192 124, 196 152, 188 172 C 182 178, 174 172, 178 158 C 184 136, 180 116, 170 100 Z"
            fill="${C.hairLight}" opacity="0.55"/>
      <path d="M194 184 L 204 176 L 202 192 Z" fill="${C.red}" stroke="${C.redDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M194 184 L 184 176 L 186 192 Z" fill="${C.red}" stroke="${C.redDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="194" cy="184" r="5" fill="${C.redDark}"/>
    </g>`
  return l() + r()
}

function dress() {
  return `
    <!-- 脖子 -->
    <path d="M112 140 L 128 140 L 128 154 L 112 154 Z" fill="${C.skin}" stroke="${C.skinEdge}" stroke-width="1.5"/>
    <!-- 黑连衣裙（上身） -->
    <path d="M96 152 L 144 152 L 151 198 Q 120 212 89 198 Z" fill="${C.black}" stroke="${C.blackEdge}" stroke-width="3"/>
    <!-- 黑裙摆（外扩 A 字） -->
    <path d="M91 196 L 149 196 L 163 242 L 77 242 Z" fill="${C.black}" stroke="${C.blackEdge}" stroke-width="3"/>
    <!-- 白围裙 -->
    <path d="M101 192 L 139 192 L 135 240 Q 120 246 105 240 Z" fill="${C.apron}" stroke="${C.apronEdge}" stroke-width="2.5"/>
    <!-- 围裙肩带 -->
    <path d="M105 152 L 110 152 L 112 196 L 107 196 Z" fill="${C.white}" stroke="${C.whiteEdge}" stroke-width="1"/>
    <path d="M130 152 L 135 152 L 133 196 L 128 196 Z" fill="${C.white}" stroke="${C.whiteEdge}" stroke-width="1"/>
    <!-- 围裙腰线 -->
    <rect x="100" y="190" width="40" height="6" rx="3" fill="${C.whiteEdge}"/>
    <!-- 衣领红蝴蝶结 -->
    <path d="M120 162 L 108 152 L 111 172 Z" fill="${C.red}" stroke="${C.redDark}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M120 162 L 132 152 L 129 172 Z" fill="${C.red}" stroke="${C.redDark}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="120" cy="163" r="6" fill="${C.redDark}"/>`
}

function legs() {
  return `
    <path d="M109 240 L 114 258 L 106 258 Z" fill="${C.skin}" stroke="${C.skinEdge}" stroke-width="2"/>
    <path d="M131 240 L 126 258 L 134 258 Z" fill="${C.skin}" stroke="${C.skinEdge}" stroke-width="2"/>
    <ellipse cx="109" cy="261" rx="12" ry="7" fill="${C.black}" stroke="${C.blackEdge}" stroke-width="2.5"/>
    <ellipse cx="131" cy="261" rx="12" ry="7" fill="${C.black}" stroke="${C.blackEdge}" stroke-width="2.5"/>`
}

function head() {
  return `
    <circle cx="120" cy="94" r="48" fill="${C.skin}" stroke="${C.skinEdge}" stroke-width="2"/>
    <!-- 前发：覆盖头顶，刘海带三个尖，金色醒目 -->
    <path d="M72 94 A 48 48 0 0 1 168 94 L 168 82
             C 158 78, 154 84, 146 82
             C 142 78, 136 86, 128 82
             C 124 78, 116 86, 108 82
             C 104 78, 98 84, 90 82
             C 84 80, 78 86, 72 94 Z"
          fill="${C.hair}" stroke="${C.hairEdge}" stroke-width="3" stroke-linejoin="round"/>
    <!-- 侧发绺 -->
    <path d="M74 96 C 64 116, 68 140, 80 148 C 90 140, 88 118, 86 100 Z" fill="${C.hair}" stroke="${C.hairEdge}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M166 96 C 176 116, 172 140, 160 148 C 150 140, 152 118, 154 100 Z" fill="${C.hair}" stroke="${C.hairEdge}" stroke-width="3" stroke-linejoin="round"/>`
}

function face(eyes, mouth) {
  const blush = `
    <ellipse cx="92" cy="112" rx="8" ry="4.5" fill="${C.blush}" opacity="0.6"/>
    <ellipse cx="148" cy="112" rx="8" ry="4.5" fill="${C.blush}" opacity="0.6"/>`
  const brow = `
    <path d="M90 84 Q 102 76 114 84" stroke="${C.hairDark}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M126 84 Q 138 76 150 84" stroke="${C.hairDark}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
  let e = ''
  if (eyes === 'blink') {
    e = `
      <path d="M92 96 Q 102 90 112 96" stroke="${C.eyeDark}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M128 96 Q 138 90 148 96" stroke="${C.eyeDark}" stroke-width="4" fill="none" stroke-linecap="round"/>`
  } else if (eyes === 'happy') {
    e = `
      <path d="M90 100 Q 102 84 114 100" stroke="${C.eyeDark}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path d="M126 100 Q 138 84 150 100" stroke="${C.eyeDark}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`
  } else {
    // Muse Dash 式大眼：大高光 + 星芒 + 下反光
    e = `
      <ellipse cx="102" cy="98" rx="10.5" ry="13" fill="${C.eye}" stroke="${C.eyeDark}" stroke-width="1.6"/>
      <circle cx="97.5" cy="92" r="3.4" fill="${C.eyeHi}"/>
      <circle cx="107" cy="104" r="2.2" fill="${C.eyeStar}"/>
      <ellipse cx="99" cy="106" rx="3.4" ry="1.6" fill="${C.eyeHi}" opacity="0.55"/>
      <ellipse cx="138" cy="98" rx="10.5" ry="13" fill="${C.eye}" stroke="${C.eyeDark}" stroke-width="1.6"/>
      <circle cx="133.5" cy="92" r="3.4" fill="${C.eyeHi}"/>
      <circle cx="143" cy="104" r="2.2" fill="${C.eyeStar}"/>
      <ellipse cx="135" cy="106" rx="3.4" ry="1.6" fill="${C.eyeHi}" opacity="0.55"/>`
  }
  let m = ''
  if (mouth === 'open') {
    m = `<ellipse cx="120" cy="120" rx="5.5" ry="8" fill="${C.mouth}" stroke="${C.mouth}" stroke-width="1"/>
         <ellipse cx="120" cy="125" rx="3.5" ry="3" fill="${C.tongue}"/>`
  } else if (mouth === 'grin') {
    m = `<path d="M106 114 Q 120 130 134 114 Q 120 148 106 114 Z" fill="${C.mouth}" stroke="${C.mouth}" stroke-width="1"/>
         <path d="M114 126 Q 120 132 126 126 Q 120 130 114 126 Z" fill="${C.tongue}"/>`
  } else {
    m = `<path d="M112 116 Q 120 123 128 116" stroke="${C.mouth}" stroke-width="3" fill="none" stroke-linecap="round"/>`
  }
  return blush + brow + e + m
}

function hat(hatTilt) {
  // Muse Dash 式圆润魔女帽：白帽带 + 金星，帽檐盖住刘海顶端
  return `
    <g transform="rotate(${hatTilt} 120 54)">
      <!-- 帽檐 -->
      <ellipse cx="120" cy="54" rx="56" ry="11" fill="${C.black}" stroke="${C.blackEdge}" stroke-width="3"/>
      <!-- 锥体：圆润上收，尖端略钝 -->
      <path d="M102 50 C 96 28, 100 10, 120 6 C 140 10, 144 28, 138 50 Z"
            fill="${C.black}" stroke="${C.blackEdge}" stroke-width="3" stroke-linejoin="round"/>
      <!-- 白帽带 -->
      <path d="M97 40 L 143 40 L 142 50 L 98 50 Z" fill="${C.band}" stroke="${C.whiteEdge}" stroke-width="1.5"/>
      <!-- 金星（帽带上方） -->
      <path d="M${star5(120, 32, 8)}" fill="${C.goldHi}" stroke="${C.gold}" stroke-width="1" stroke-linejoin="round"/>
      <!-- 帽檐高光 -->
      <path d="M90 51 Q 120 43 150 51" stroke="${C.blackHi}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.5"/>
    </g>`
}

function sleevesArms(kind) {
  function arm(pts, handX, handY) {
    const p = pts.join(' ')
    return `
      <path d="${p}" stroke="${C.blackEdge}" stroke-width="24" stroke-linecap="round" fill="none"/>
      <path d="${p}" stroke="${C.white}" stroke-width="18" stroke-linecap="round" fill="none"/>
      <circle cx="${handX}" cy="${handY}" r="8" fill="${C.skin}" stroke="${C.skinEdge}" stroke-width="2.5"/>`
  }
  if (kind === 'up') {
    // 举手：白色泡泡袖举到头侧（Q 版欢呼姿势）
    return arm(['M96 156 C 82 148, 74 130, 82 116'], 84, 114) +
           arm(['M144 156 C 158 148, 166 130, 158 116'], 156, 114)
  }
  if (kind === 'gesture') {
    // 说话：左手垂下，右手抬到脸侧比划
    return arm(['M96 156 C 84 162, 80 176, 86 190'], 88, 192) +
           arm(['M144 156 C 154 154, 158 142, 154 128'], 153, 126)
  }
  // 垂手：白袖沿裙侧自然下垂
  return arm(['M96 156 C 84 162, 80 176, 86 190'], 88, 192) +
         arm(['M144 156 C 156 162, 160 176, 154 190'], 152, 192)
}

/* ── 单帧组装 ───────────────────────────────────────────────────────── */

function marisaFrame({
  eyes = 'open', mouth = 'smile', arms = 'down', hatTilt = 0, tailSwing = 0, bob = 0,
  sparkles = [], stars = [],
} = {}) {
  const spk = sparkles.map((p) => sparkle(p.x, p.y, p.s, p.op)).join('')
  const sts = stars.map((p) => star(p.x, p.y, p.s, p.op)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="translate(0 ${bob})">
    ${twinTails(tailSwing)}
    ${dress()}
    ${legs()}
    ${head()}
    ${face(eyes, mouth)}
    ${sleevesArms(arms)}
    ${hat(hatTilt)}
    ${spk}
    ${sts}
  </g>
</svg>`
}

/* ── 帧清单 ──────────────────────────────────────────────────────────── */

const FRAMES = [
  // 待机：眨眼 / 帽檐晃动 / 马尾摆动 / 星光
  { file: 'idle-0.png', opts: { eyes: 'open', mouth: 'smile', hatTilt: -3, tailSwing: 0 } },
  { file: 'idle-1.png', opts: { eyes: 'blink', mouth: 'smile', hatTilt: 2, tailSwing: -3,
    sparkles: [{ x: 192, y: 64, s: 8, op: 0.75 }], stars: [{ x: 52, y: 90, s: 7, op: 0.9 }] } },
  { file: 'idle-2.png', opts: { eyes: 'open', mouth: 'smile', hatTilt: 0, tailSwing: 0 } },
  { file: 'idle-3.png', opts: { eyes: 'open', mouth: 'smile', hatTilt: 3, tailSwing: 3,
    sparkles: [{ x: 50, y: 70, s: 7, op: 0.6 }], stars: [{ x: 190, y: 88, s: 6, op: 0.9 }] } },

  // 说话：张嘴/闭嘴，抬手比划，马尾摆
  { file: 'speak-0.png', opts: { eyes: 'open', mouth: 'open', arms: 'gesture', hatTilt: -4, tailSwing: -3 } },
  { file: 'speak-1.png', opts: { eyes: 'open', mouth: 'smile', arms: 'gesture', hatTilt: 2, tailSwing: 3 } },

  // 开心：眯眼大笑、双手举起、星星爆发、轻跳
  { file: 'happy-0.png', opts: { eyes: 'happy', mouth: 'grin', arms: 'up', hatTilt: -5, tailSwing: -3, bob: -5,
    sparkles: [{ x: 58, y: 86, s: 11, op: 0.95 }, { x: 188, y: 96, s: 10, op: 0.85 }, { x: 120, y: 150, s: 9, op: 0.7 }],
    stars: [{ x: 40, y: 56, s: 9, op: 0.95 }, { x: 200, y: 60, s: 8, op: 0.9 }] } },
  { file: 'happy-1.png', opts: { eyes: 'happy', mouth: 'grin', arms: 'up', hatTilt: 5, tailSwing: 3, bob: -2,
    sparkles: [{ x: 70, y: 112, s: 12, op: 0.95 }, { x: 176, y: 80, s: 11, op: 0.85 }],
    stars: [{ x: 48, y: 140, s: 8, op: 0.9 }, { x: 196, y: 132, s: 9, op: 0.9 }] } },
]

/* ── 渲染 ────────────────────────────────────────────────────────────── */

/** 像素画渲染：下采样到网格 → 16 色调色板量化 → ×4 最近邻放大。 */
async function pixelate(svg) {
  const gridW = 60
  const gridH = 70
  const small = await sharp(Buffer.from(svg))
    .resize(gridW, gridH, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(small.data.length)
  for (let i = 0; i < small.data.length; i += 4) {
    const a = small.data[i + 3]
    if (a < 128) { out[i + 3] = 0; continue }
    const [r, g, b] = nearestPalette(small.data[i], small.data[i + 1], small.data[i + 2])
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255
  }
  const quant = await sharp(out, { raw: { width: gridW, height: gridH, channels: 4 } }).png().toBuffer()
  return sharp(quant).resize(W, H, { kernel: 'nearest' }).png().toBuffer()
}

;(async function main() {
  const outDir = __dirname
  for (const f of FRAMES) {
    const svg = marisaFrame(f.opts)
    let img = sharp(Buffer.from(svg)).png()
    if (PIXEL) img = sharp(await pixelate(svg)).png()
    await img.toFile(path.join(outDir, f.file))
    console.log('✓', f.file + (PIXEL ? ' (pixel)' : ' (smooth)'))
  }
  console.log('done →', outDir)
})().catch((err) => {
  console.error('render failed:', err.message)
  process.exit(1)
})
