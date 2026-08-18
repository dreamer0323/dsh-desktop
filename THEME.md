# Marisa（雾雨魔理沙）主题 + 桌面宠物

把 `dsh_desktop` 及其加载的 Web 界面整体换成「东方 Project · 雾雨魔理沙」主题，并附带一个透明置顶桌面宠物。**全部实现都在桌面外壳内**（Electron 注入 + 多窗口），不改动 Harness 源码——因此它能在 Harness 每次重建后原样工作。

> 版权提醒：魔理沙是 ZUN 的角色，同人图/语音均有版权。仓库内提供的都是**自制占位素材**；请只使用你有使用权的图片与音频。

## 一、它做了什么

| 功能 | 实现 |
|---|---|
| Marisa 配色 | 覆盖 `--dsw-alias-*` 设计令牌（黑/白/金 + 八卦炉暖橙） |
| 背景图 | `body[data-ds-marisa]` 注入背景图 + 暗化遮罩，面板改半透明让图透出 |
| 按钮道具图 | 主按钮=金色八卦炉渐变；图标按钮=魔法星点缀（`:has()` 选择器） |
| 事件音效 | WebAudio 合成占位音：click / hover / complete / error / auth（可换成真音频） |
| 桌面宠物 | 独立透明置顶窗口，**静态 Marisa Fumo 形象**（无动画）+ 拖拽 + 内存/CPU 实时播报 |
| 回合完成提醒 | 检测网页 `[data-streaming]` 回合信号 → 宠物弹「回答完毕」（**不含对话内容**） |
| token 用量 | 轮询对话区 `输入 X tok · 输出 Y tok` 统计行 → 宠物头顶金色 token 药丸 |
| 授权提醒 | 检测 `[data-approval-key]` 接管面板（agent 请求批准）→ 红色警示横幅 + 气泡 + 提示音 + 系统通知 |
| 侧边栏开关 | 主界面右侧注入「宠」标签页，一键显示/隐藏桌宠 |

> v4：对话 / 语音模块已按用户要求移除（详见下文「设计取舍」）。

## 二、文件地图

```
dsh_desktop/
├─ config.json                       # theme / pet 开关与参数
├─ src/
│  ├─ main.js                        # 接线：注入主题、创建宠物、转发回合/授权事件、桌宠开关
│  ├─ theme.js                       # 主题注入器（url→data:URI + insertCSS/executeJavaScript）
│  ├─ pet.js                         # 宠物窗口管理 + 系统资源推送 + 事件转发 + 可见性控制
│  ├─ stats.js                       # CPU/内存采样（os.cpus 差值 + getSystemMemoryInfo）
│  ├─ preload.js                     # 主窗口桥（notifyTurn / notifyPet / pet 开关）
│  └─ preload-pet.js                 # 宠物窗口桥（onStats / onTurn / onEvent / onConfig）
├─ ui/
│  ├─ pet.html / pet.css / pet.js    # 宠物界面（静态 fumo + 气泡 + token 药丸 + 授权横幅）
│  └─ loading.html / …               # 原有启动页（未改）
├─ assets/
│  ├─ themes/marisa/
│  │  ├─ theme.css                   # ← 换肤主入口（配色 + 背景 + 按钮）
│  │  ├─ inject.js                   # ← 音效 + 回合完成 + token + 授权 + 侧边栏标签
│  │  ├─ images/*.svg                # ← 占位图（背景/八卦炉/扫帚/帽/蘑菇/星）
│  │  └─ sounds/                     # ← 放入真音频（见下文命名）
│  └─ pet/
│     ├─ marisa-fumo.png             # ← 宠物形象本体（透明 PNG，可换）
│     ├─ make-fumo.cjs               # ← fumo 抠透明背景生成器
│     ├─ pet_skill/                  # ← skill / MCP / 工具参数
│     └─ legacy-anim/                # ← 已废弃的精灵图动画方案（备查）
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

### 3. 音效
把音频放入 `assets/themes/marisa/sounds/`，文件名按事件命名：

```
sounds/click.mp3      # 按钮点击
sounds/hover.wav      # 悬停
sounds/complete.mp3   # 回合完成
sounds/error.ogg      # 出错
sounds/auth.mp3       # 需要用户授权（双音提醒）
```

支持 `.mp3 / .wav / .ogg / .m4a`。没放文件时自动用 WebAudio 合成占位音。

### 4. 宠物形象
宠物是**静态单帧**：直接覆盖 `assets/pet/marisa-fumo.png`（建议 1:1 方形、透明背景）即可，宠物窗口自动生效。重新从源图抠背景：`node assets/pet/make-fumo.cjs`。

## 四、配置（config.json）

```json
{
  "theme": { "enabled": true, "name": "marisa" },
  "pet": {
    "enabled": true,
    "width": 300,
    "height": 400,
    "statsIntervalMs": 2000,
    "tokens": { "enabled": true },   // token 用量药丸
    "notify": { "enabled": true }    // 回合完成 / 授权提醒（气泡+横幅+系统通知）
  }
}
```

`statsIntervalMs` 是宠物刷新内存/CPU 的间隔。关掉某功能把 `enabled` 设为 `false`。

## 五、运行与验证

```powershell
cd D:\dev\agent\agent_dev\dsh_dev\dsh_desktop
npm start
```

预期效果：启动页之后，主界面变为魔理沙黑金配色 + 背景图；右下角出现一只可拖动的 **Marisa Fumo**（静态，无动画），气泡显示 `内存 x% · CPU y%`；点击按钮有提示音；一次对话生成完成时宠物弹「回答完毕」；agent 请求授权时宠物弹红色警示横幅 + 双音提醒 + 系统通知；宠物头顶金色 token 药丸实时刷新；主界面右侧「宠」标签页可显示/隐藏桌宠。

## 六、数据链路（inject.js 注入式，不改 harness 源码）

桌面壳在 harness 页面里注入的 `inject.js` 负责采集信号并经 preload 桥转发给宠物：

| 能力 | 信号来源（harness web 前端） | 转发 |
|---|---|---|
| 回合完成 | `[data-streaming]` 助手消息根节点出现/消失（只看出现与否，**不读内容**） | `dsh:turn {state:'done'}` → 宠物「回答完毕」 |
| token 用量 | 对话区统计行文本 `输入 X tok · 输出 Y tok`（`[data-composer-seat]` 下） | `dsh:pet {kind:'tokens'}` → token 药丸 |
| 授权请求 | 接管面板 `[data-approval-key]` / `[data-approval-scroll]`（按钮：拒绝/允许一次） | `dsh:pet {kind:'auth'}` → 红色横幅 + 双音 + 系统通知 |
| 侧边栏开关 | 右侧「宠」标签页 → `window.dsh.togglePet()` | `dsh:pet-toggle` / `dsh:pet-state` → 显示/隐藏 |

## 七、设计取舍（v4）

- **删除对话**：宠物不再有聊天面板/中继，也不抓取主窗口对话内容——主窗口任何回合完成只弹「回答完毕」。问答原需走 harness agent 全链路（`session.prompt`→多步推理→DOM 抓取→回传），是宠物"慢"的唯一来源；删除后宠物交互即时。
- **删除语音**：TTS（sapi/genie）与油库里 DSP 全部移除，相关文件与测试一并清理。
- 基准数据（`test/bench-pet.cjs`）：宠物窗口创建→加载约 100ms；RSS 约 80MB（其中 ~78MB 是 Electron 运行时固有，宠物窗口自身增量很小）。宠物本体为静态图，CPU 空闲近 0，仅 2s stats / 4s token / 2s 授权轮询。

## 八、已知边界 / 后续可做

- **按钮图片选择器**：见上文，属唯一脆弱点，令牌换肤不受影响。
- **宠物点击穿透**：宠物窗口整块矩形会挡住下层点击；要「透明区域穿透、只响应宠物本体」需在渲染层上报 hover 状态再由主进程切换 `setIgnoreMouseEvents`，可作后续增强。
- **出错提醒**：完成提醒已实现；「生成出错」目前只在回合异常结束时降级，未做精细错误态识别（可在 `inject.js` 里扩展检测 `[data-error]`）。
- **token 采集依赖文本**：统计行只有 CSS 哈希 class，靠文本正则匹配；若 harness 改文案需同步 `inject.js` 的正则。
- **授权面板**：`[data-approval-key]` 是 harness 当前接管面板的信号；若后续改成弹窗/新增 pending 类型，需同步选择器。
- **下载的工具参数**：后续在本仓库引入的 skill / MCP / 工具清单建议放 `assets/pet/pet_skill/`。
