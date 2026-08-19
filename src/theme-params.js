'use strict'

/**
 * Theme parameter system (pure Node, no Electron).
 *
 * A theme's look is driven by a small set of "friendly" parameters the user
 * tweaks in the settings UI. `expandParams()` turns those into the full
 * `--dsw-alias-*` token dictionary that `template.css` placeholders consume —
 * the rgba variants (borders, hovers, translucent panels) are derived so that
 * changing one accent color re-themes the whole UI. With the marisa defaults
 * below, the rendered CSS reproduces the original hardcoded marisa theme
 * value-for-value.
 */

function hexRgb(hex) {
  let h = String(hex || '#000000').replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgba(hex, alpha) {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function gradient(a, b) {
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`
}

/** Friendly parameter defaults — the exact marisa palette. */
const DEFAULT_FRIENDLY = {
  // 基础（面板/背景表面）
  bgBase: '#0d0a15',
  bgL1: '#161121',
  bgL2: '#1e172c',
  bgL3: '#271e38',
  bgOverlay: '#120d1c',
  sidebarBgColor: '#110d1a',
  inputBgColor: '#161120',
  // 强调（品牌色/按钮/边框）
  accent: '#f6b93f',
  accentSoft: '#ffce6b',
  accentText: '#f7f1e6',
  accentInvert: '#171224',
  labelOnAccent: '#241a08',
  gradientStart: '#ffd166',
  gradientEnd: '#f2a93b',
  gradientHoverStart: '#ffe08a',
  gradientHoverEnd: '#f6b93f',
  borderColor: '#f6b93f',
  // 文字阶梯
  textPrimary: '#f7f1e6',
  textSecondary: '#c9bdd8',
  textTertiary: '#9d90b3',
  textCaption: '#8a7f9e',
  textDimmed: '#6b5f82',
  // 语义色
  success: '#4cd97b',
  success2: '#6ee79a',
  error: '#ff6b6b',
  error2: '#ff8c8c',
  warn: '#ffd166',
  warn2: '#ffdf8c',
  warnLabel: '#ffb84d',
  info: '#ff9f43',
  infoHover: '#ffb35c',
  // 背景图遮罩
  overlayAlpha: 0.62,
  overlayColor: '#0b0713',
  // 代码/滚动条（高级）
  codeBg: '#181224',
  codeBg2: '#20182e',
  codeInline: '#241c34',
  codeSel: '#2f2542',
  codeUnsel: '#1d1729',
  scrollbarBg: '#3a2f4f',
  scrollbarHover: '#4d3f66',
}

/**
 * Friendly-field definitions rendered by the settings UI. `type` is `color`
 * (hex) or `number` (slider, with min/max/step).
 * @type {Array<{group: string, key: string, label: string, type: string, min?: number, max?: number, step?: number}>}
 */
const FIELD_DEFS = [
  { group: '基础配色', key: 'bgBase', label: '背景底色', type: 'color' },
  { group: '基础配色', key: 'bgL1', label: '面板 L1', type: 'color' },
  { group: '基础配色', key: 'bgL2', label: '面板 L2', type: 'color' },
  { group: '基础配色', key: 'bgL3', label: '面板 L3', type: 'color' },
  { group: '基础配色', key: 'bgOverlay', label: '浮层底色', type: 'color' },
  { group: '基础配色', key: 'sidebarBgColor', label: '侧边栏底色', type: 'color' },
  { group: '基础配色', key: 'inputBgColor', label: '输入框底色', type: 'color' },

  { group: '强调色', key: 'accent', label: '强调色', type: 'color' },
  { group: '强调色', key: 'accentSoft', label: '强调·柔和', type: 'color' },
  { group: '强调色', key: 'accentText', label: '强调文字', type: 'color' },
  { group: '强调色', key: 'accentInvert', label: '强调反色', type: 'color' },
  { group: '强调色', key: 'labelOnAccent', label: '强调上的文字', type: 'color' },
  { group: '强调色', key: 'gradientStart', label: '按钮渐变·起', type: 'color' },
  { group: '强调色', key: 'gradientEnd', label: '按钮渐变·止', type: 'color' },
  { group: '强调色', key: 'gradientHoverStart', label: '按钮悬停·起', type: 'color' },
  { group: '强调色', key: 'gradientHoverEnd', label: '按钮悬停·止', type: 'color' },
  { group: '强调色', key: 'borderColor', label: '边框色', type: 'color' },

  { group: '文字', key: 'textPrimary', label: '主文字', type: 'color' },
  { group: '文字', key: 'textSecondary', label: '次级文字', type: 'color' },
  { group: '文字', key: 'textTertiary', label: '三级文字', type: 'color' },
  { group: '文字', key: 'textCaption', label: '说明文字', type: 'color' },
  { group: '文字', key: 'textDimmed', label: '弱化文字', type: 'color' },

  { group: '语义色', key: 'success', label: '成功', type: 'color' },
  { group: '语义色', key: 'success2', label: '成功·亮', type: 'color' },
  { group: '语义色', key: 'error', label: '错误', type: 'color' },
  { group: '语义色', key: 'error2', label: '错误·亮', type: 'color' },
  { group: '语义色', key: 'warn', label: '警告', type: 'color' },
  { group: '语义色', key: 'warn2', label: '警告·亮', type: 'color' },
  { group: '语义色', key: 'warnLabel', label: '警告文字', type: 'color' },
  { group: '语义色', key: 'info', label: '信息', type: 'color' },
  { group: '语义色', key: 'infoHover', label: '信息·悬停', type: 'color' },

  { group: '背景图', key: 'overlayAlpha', label: '遮罩不透明度', type: 'number', min: 0, max: 1, step: 0.01 },
  { group: '背景图', key: 'overlayColor', label: '遮罩颜色', type: 'color' },

  { group: '代码/滚动条', key: 'codeBg', label: '代码块底色', type: 'color' },
  { group: '代码/滚动条', key: 'codeBg2', label: '代码横幅', type: 'color' },
  { group: '代码/滚动条', key: 'codeInline', label: '行内代码', type: 'color' },
  { group: '代码/滚动条', key: 'codeSel', label: '代码选中', type: 'color' },
  { group: '代码/滚动条', key: 'codeUnsel', label: '代码未选', type: 'color' },
  { group: '代码/滚动条', key: 'scrollbarBg', label: '滚动条', type: 'color' },
  { group: '代码/滚动条', key: 'scrollbarHover', label: '滚动条悬停', type: 'color' },
]

/** Set of friendly keys (drives mergeParams + collapseParams). */
const FRIENDLY_KEYS = new Set(FIELD_DEFS.map((f) => f.key))

/** Unexposed tokens that keep exact marisa values unless JSON-overridden. */
const CONSTANT_TOKENS = {
  dswBgSkeleton: 'rgba(255, 255, 255, 0.08)',
  dswBorderInverted: 'rgba(255, 255, 255, 0.06)',
  dswBorderInverted2: 'rgba(255, 255, 255, 0.08)',
  dswButtonFloatingHover: 'rgba(50, 38, 70, 0.95)',
  dswInteractiveHoverSolid: 'rgba(255, 255, 255, 0.06)',
  dswLabelPrimaryDimmed: '#e8dcc4',
  dswMarkdownCitation: '#2a2138',
  dswMarkdownTag: '#241c34',
  dswMarkdownPlaceholder: '#241c34',
  dswStateBusinessTertiary: '#3a2a18',
  dswStateSuccessTertiary: '#14361f',
  dswStateWarnTertiary: '#3a2f16',
  dswToastBg: '#2a2138',
  dswTooltipBg: '#2f2542',
  dswSpecificMenu: 'var(--dsw-alias-bg-layer-3)',
  dswSpecificSelector: '#241c34',
  dswSpecificBubble: '#241c34',
  dswSpecificBubbleHighlight: '#2f2542',
  dswSpecificTip: '#221a30',
}

/**
 * Expand friendly parameters into the full token dictionary that
 * template.css placeholders consume. Defaults reproduce the marisa theme.
 * @param {Partial<typeof DEFAULT_FRIENDLY>} f
 * @returns {Record<string, string | number>}
 */
function expandParams(f) {
  const p = { ...DEFAULT_FRIENDLY, ...(f || {}) }
  return {
    // chrome vars consumed by inject.js tabs
    dsThemeAccent: p.accent,
    dsThemeAccentSoft: p.gradientStart,
    dsThemeAccentInk: p.labelOnAccent,

    // raw colors used directly
    bgBase: p.bgBase,
    accent: p.accent,
    accentSoft: p.accentSoft,
    accentText: p.accentText,
    accentInvert: p.accentInvert,
    labelOnAccent: p.labelOnAccent,
    gradientStart: p.gradientStart,
    gradientEnd: p.gradientEnd,
    textPrimary: p.textPrimary,
    textSecondary: p.textSecondary,
    textTertiary: p.textTertiary,
    textCaption: p.textCaption,
    textDimmed: p.textDimmed,
    success: p.success,
    success2: p.success2,
    error: p.error,
    error2: p.error2,
    warn: p.warn,
    warn2: p.warn2,
    warnLabel: p.warnLabel,
    info: p.info,
    infoHover: p.infoHover,

    // gradients
    primaryGradient: gradient(p.gradientStart, p.gradientEnd),
    hoverGradient: gradient(p.gradientHoverStart, p.gradientHoverEnd),

    // background overlay
    overlayAlpha: p.overlayAlpha,
    overlayColor: p.overlayColor,
    overlayGradient: rgba(p.overlayColor, p.overlayAlpha),

    // derived rgba variants
    dswBgBase: rgba(p.bgBase, 0.42),
    dswBgLayer1: rgba(p.bgL1, 0.6),
    dswBgLayer2: rgba(p.bgL2, 0.66),
    dswBgLayer3: rgba(p.bgL3, 0.74),
    dswBgModule: rgba(p.bgL2, 0.66),
    dswBgMulti: rgba(p.bgL2, 0.66),
    dswBgOverlay: rgba(p.bgOverlay, 0.92),
    dswBorderL1: rgba(p.borderColor, 0.1),
    dswBorderL2: rgba(p.borderColor, 0.18),
    dswBorderL3: rgba(p.borderColor, 0.26),
    dswBorderL4: rgba(p.borderColor, 0.34),
    dswBorderL2Thin: rgba(p.borderColor, 0.18),
    dswButtonPrimaryDimmed: rgba(p.accent, 0.18),
    dswButtonElevated: rgba(p.bgL2, 0.85),
    dswButtonFloating: rgba(p.bgL3, 0.9),
    dswButtonGhostFill: rgba(p.accent, 0.18),
    dswButtonGhostHover: rgba(p.accent, 0.12),
    dswButtonGhostBorder: rgba(p.accent, 0.5),
    dswButtonToolbar: rgba(p.accent, 0.12),
    dswButtonToolbarHover: rgba(p.accent, 0.2),
    dswButtonToolbarInvisible: rgba(p.accent, 0.08),
    dswInteractiveHover: rgba(p.accent, 0.12),
    dswInteractiveActive: rgba(p.accent, 0.2),
    dswInteractiveHoverAccent: rgba(p.accent, 0.18),
    dswInteractiveHoverDanger: rgba(p.error, 0.15),
    dswMarkdownCode: rgba(p.codeBg, 0.9),
    dswMarkdownCodeBanner: rgba(p.codeBg2, 0.9),
    dswMarkdownInline: rgba(p.codeInline, 0.9),
    dswMarkdownSel: p.codeSel,
    dswMarkdownUnsel: p.codeUnsel,
    dswScrollbarBg: p.scrollbarBg,
    dswScrollbarHover: p.scrollbarHover,
    dswSidebarFill: rgba(p.sidebarBgColor, 0.74),
    dswSidebarNavActive: rgba(p.accent, 0.14),
    dswInputMajor: rgba(p.inputBgColor, 0.9),
    dswLoginInput: rgba(p.inputBgColor, 0.9),

    ...CONSTANT_TOKENS,
  }
}

/**
 * Merge full params (e.g. from the advanced JSON editor) with the friendly
 * form values: friendly/derived values always win, any *extra* custom token
 * the user wrote in JSON is preserved.
 * @param {Record<string, unknown>} fullParams
 * @param {Partial<typeof DEFAULT_FRIENDLY>} friendly
 */
function mergeParams(fullParams, friendly) {
  const expanded = expandParams(friendly)
  const extras = {}
  for (const [key, value] of Object.entries(fullParams || {})) {
    if (!FRIENDLY_KEYS.has(key) && !(key in expanded)) extras[key] = value
  }
  return { ...expanded, ...extras }
}

/** Map full params back onto the friendly keys (for form population). */
function collapseParams(fullParams, defaults = DEFAULT_FRIENDLY) {
  const out = { ...defaults }
  for (const key of FRIENDLY_KEYS) {
    if (fullParams && fullParams[key] !== undefined) out[key] = fullParams[key]
  }
  return out
}

module.exports = {
  DEFAULT_FRIENDLY,
  FIELD_DEFS,
  FRIENDLY_KEYS,
  expandParams,
  mergeParams,
  collapseParams,
  hexRgb,
}
