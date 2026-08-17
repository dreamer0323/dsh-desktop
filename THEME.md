# Marisa（雾雨魔理沙）主题 + 桌面宠物

把 `dsh_desktop` 及其加载的 Web 界面整体换成「东方 Project · 雾雨魔理沙」主题，并附带一个透明置顶桌面宠物。**全部实现都在桌面外壳内**（Electron 注入 + 多窗口），不改动 Harness 源码——因此它能在 Harness 每次重建后原样工作。

> 版权提醒：魔理沙是 ZUN 的角色，同人图/语音均有版权。仓库内提供的都是**自制占位素材**；请只使用你有使用权的图片与音频。

## 一、它做了什么

| 功能 | 实现 |
|---|---|
| Marisa 配色 | 覆盖 `--dsw-alias-*` 设计令牌（黑/白/金 + 八卦炉暖橙） |
| 背景图 | `body[data-ds-marisa]` 注入背景图 + 暗化遮罩，面板改半透明让图透出 |
| 按钮道具图 | 主按钮=金色八卦炉渐变；图标按钮=魔法星点缀（`:has()` 选择器） |
| 事件音效 | WebAudio 合成占位音：click / hover / complete（可换成真语音） |
| 桌面宠物 | 独立透明置顶窗口，精灵图动画 + 拖拽 + 内存/CPU 实时播报 |
| 生成完成提醒 | 检测网页 `[data-streaming]` 回合信号 → 宠物气泡 + 完成音 + 预计用时 |

## 二、文件地图

```
dsh_desktop/
├─ config.json                       # theme / pet 开关与参数
├─ src/
│  ├─ main.js                        # 接线：注入主题、创建宠物、转发回合事件
│  ├─ theme.js                       # 主题注入器（url→data:URI + insertCSS/executeJavaScript）
│  ├─ pet.js                         # 宠物窗口管理 + 系统资源推送 + 回合转发
│  ├─ stats.js                       # CPU/内存采样（os.cpus 差值 + getSystemMemoryInfo）
│  ├─ preload.js                     # 主窗口桥（新增 notifyTurn）
│  └─ preload-pet.js                 # 宠物窗口桥（onStats / onTurn）
├─ ui/
│  ├─ pet.html / pet.css / pet.js    # 宠物界面（含 SVG 兜底吉祥物）
│  └─ loading.html / …               # 原有启动页（未改）
└─ assets/
   ├─ themes/marisa/
   │  ├─ theme.css                   # ← 换肤主入口（配色 + 背景 + 按钮）
   │  ├─ inject.js                   # ← 音效 + 回合检测
   │  ├─ images/*.svg                # ← 占位图（背景/八卦炉/扫帚/帽/蘑菇/星）
   │  └─ sounds/                     # ← 放入真语音（见下文命名）
   └─ pet/                           # ← 放入精灵图帧（见下文命名）
```

## 三、如何替换素材

所有素材都走**「丢文件进来即可」**的方式，`src/theme.js` 会把 `theme.css` 里的 `url(...)` 与音效文件在注入时转成 `data:` URI，因此 PNG/MP3 也能直接工作，无需改代码。

### 1. 背景图
把图放进 `assets/themes/marisa/images/`，然后改 `theme.css` 里这一行：

```css
url("images/background.svg")   /* → 换成 images/你的图.png */
```

若图片较亮、影响可读性，调大遮罩透明度（`theme.css` 中 `linear-gradient(rgba(11,7,19,0.62), …)` 的 `0.62`）。

### 2. 按钮道具图
- **主按钮**：改 `--dsw-alias-button-primary-fill` 的渐变即可（当前是八卦炉金色）。
- **图标按钮**：`theme.css` 底部 `BUTTON PROPS` 区有示例规则（`button:has(> span > svg)`），把 `url("images/star.svg")` 换成 `hat.svg / broom.svg / hakkero.svg / mushroom.svg` 任意一个。
- 已附赠道具图：`hakkero.svg`（八卦炉）、`broom.svg`（扫帚）、`hat.svg`（魔女帽）、`mushroom.svg`（蘑菇）、`star.svg`（星）。

> 注意：按钮类名是 CSS Modules 哈希，`:has()` 选择器在 Harness 大改 DOM 后可能需微调；其上方的**令牌覆盖永远有效**，承担了绝大部分观感。

### 3. 音效 / 语音
把音频放入 `assets/themes/marisa/sounds/`，文件名按事件命名：

```
sounds/click.mp3      # 按钮点击
sounds/hover.wav      # 悬停
sounds/complete.mp3   # 生成完成
sounds/error.ogg      # 出错
```

支持 `.mp3 / .wav / .ogg / .m4a`。没放文件时自动用 WebAudio 合成占位音。

### 4. 宠物精灵图
把序列帧放入 `assets/pet/`，按 `姿势-序号.png` 命名（帧数/帧率在 `ui/pet.js` 顶部 `SPRITES` 里可调）：

```
pet/idle-0.png  idle-1.png  idle-2.png  idle-3.png   # 待机（4 帧）
pet/speak-0.png speak-1.png                          # 说话（2 帧）
pet/happy-0.png happy-1.png                          # 开心（2 帧）
```

未放帧时自动显示内置的 SVG 兜底吉祥物（魔女帽 + 星 + 脸）。

## 四、配置（config.json）

```json
{
  "theme": { "enabled": true, "name": "marisa" },
  "pet": { "enabled": true, "width": 240, "height": 280, "statsIntervalMs": 2000 }
}
```

`statsIntervalMs` 是宠物刷新内存/CPU 的间隔。关掉某功能把 `enabled` 设为 `false`。

## 五、运行与验证

```powershell
cd D:\dev\agent\agent_dev\dsh_dev\dsh_desktop
npm start
```

预期效果：启动页之后，主界面变为魔理沙黑金配色 + 背景图；右下角出现可拖动的宠物，气泡显示 `内存 x% · CPU y%`；点击按钮有提示音；一轮对话生成完成时宠物弹「生成完成～ 用时 Ns」并播放完成音。

## 六、已知边界 / 后续可做

- **按钮图片选择器**：见上文，属唯一脆弱点，令牌换肤不受影响。
- **宠物点击穿透**：v1 宠物窗口整块矩形会挡住下层点击；要「透明区域穿透、只响应宠物本体」需在渲染层上报 hover 状态再由主进程切换 `setIgnoreMouseEvents`，可作为 v2 增强。
- **出错提醒**：完成提醒已实现；「生成出错」目前只在回合异常结束时降级，未做精细错误态识别（可在 `inject.js` 里扩展检测 `[data-error]`）。
- **Live2D**：当前为精灵图方案（你选择的），后续可替换 `ui/pet.html` 的渲染层为 Live2D 而不动 IPC 链路。
