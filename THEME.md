# 主题系统与桌面宠物

桌面外壳内置一套**可参数化主题系统**和一个**透明置顶桌面宠物**。全部实现在桌面外壳内（Electron 注入 + 多窗口），**不改动 Harness 源码**——因此 Harness 每次重建后都能原样工作。

> 版权提醒：主题与桌宠素材为个人学习的自制占位素材，请只使用你有使用权的图片与音频。

---

## 🎨 用户指南

### 切换 / 定制主题

内置主题：**cirno**（默认）/ **rinmu** / **marisa**。

1. 启动程序，主界面右侧点击 **「主题」** 标签页 → 打开主题设置窗口
2. **切换主题**：左侧主题列表点击，点「设为当前」立即应用
3. **创建主题**：左下输入名称 →「创建主题」→ 以模板克隆并自动切换
4. **改色**：右侧「外观参数」按分组调整颜色/遮罩，点「保存并应用」即时生效（**不重载页面、不丢对话**）
5. **换素材**：每个素材槽位有缩略预览 + 「选择图片/音频」→ 选本机文件自动复制并应用；音效可试听

### 桌面宠物

- **交互**：按住拖动；单击弹跳并播放点击音效（音效可在设置里替换，未设置时用合成音）
- **判定区贴合形象**：鼠标只在宠物形象附近才响应，透明区域点击直接穿透到下层应用，不挡操作
- **实时信息**：气泡显示 `内存 x% · CPU y%`，头顶金色药丸显示本轮输入/输出 token
- **提醒**：agent 请求授权时弹红色警示横幅；回答完成时弹「回答完毕」
- **开关**：主界面右侧「宠」标签页一键显示/隐藏

> 桌宠是轻量形态：无对话、无语音，交互即时。

---

## 🛠️ 开发者指南

### 主题目录结构

每个主题是一个目录 `assets/themes/<name>/`：

```
assets/themes/<name>/
├─ theme.json      # 主题清单：显示名、参数、素材槽位（路径）
├─ template.css    # 参数化样式表：{{token}} 占位符由 theme.json 渲染
├─ inject.js       # 运行时注入（音效/回合/token/授权/侧边栏标签页）
├─ images/         # 背景图、道具图（可经设置界面替换）
└─ sounds/         # 事件音效（可经设置界面替换）
```

**渲染流程**（`src/theme.js`）：读取 `theme.json` 的 `params` → 填充 `template.css` 的 `{{token}}` → 把素材槽位（背景/道具/音效）内联为 `data:` URI → 注入页面。

**文件名与内容解耦**：在本机选的任意图片/音频都会复制进主题目录，无需约定文件名。

### 参数系统（src/theme-params.js）

- 设置界面编辑**友好参数**（基础色/强调色/文字/语义色/遮罩），保存时展开为完整 `--dsw-alias-*` token 字典（自动派生 rgba 变体、悬停态）
- 素材槽位：`background`（背景图）、`props.*`（star/hakkero/broom/hat/mushroom 道具图）、`sounds.*`（click/hover/complete/error/auth 音效）
- **全局素材**（不属于单个主题，全程序生效）：`pet` 宠物形象、`pet-sound` 宠物点击音效

### 桌宠交互（src/pet.js + ui/pet.js）

- 独立透明置顶 BrowserWindow，`setIgnoreMouseEvents(true, { forward: true })` 让透明区鼠标穿透
- 渲染进程 `mousemove` 时用 `elementFromPoint` 检测光标是否在交互元素（形象/气泡/药丸/横幅）上，动态切换捕获——**判定区贴合形象**
- 拖动走 IPC `pet:drag`（JS 拖动，替代 `-webkit-app-region`）
- 点击判定与拖动判定在 `ui/pet.js` 中区分（按住移动 = 拖动，原地松开 = 点击）

### 数据链路（inject.js 注入式，不改 harness 源码）

桌面壳在 harness 页面里注入 `inject.js` 采集信号，经 preload 桥转发给桌宠：

| 能力 | 信号来源（harness web 前端） | 转发 |
|---|---|---|
| 回合完成 | `[data-streaming]` 消息根节点出现/消失（只看出现与否，**不读内容**） | `dsh:turn {state:'done'}` → 「回答完毕」 |
| token 用量 | 对话区统计行 `[data-composer-seat]` 文本 | `dsh:pet {kind:'tokens'}` → token 药丸 |
| 授权请求 | 接管面板 `[data-approval-key]` / `[data-approval-scroll]` | `dsh:pet {kind:'auth'}` → 警示横幅 |
| 侧边栏开关 | 「宠 / 主题」标签页 | `dsh:pet-toggle` / `dsh:open-theme-settings` |

### 配置（config.json）

```json
{
  "theme": { "enabled": true, "name": "cirno" },
  "pet": {
    "enabled": true,
    "width": 300,
    "height": 400,
    "statsIntervalMs": 2000,
    "tokens": { "enabled": true },
    "notify": { "enabled": true }
  }
}
```

- `theme.name`：当前生效主题，切主题时设置界面自动写回
- `pet.tokens` / `pet.notify`：单独开关 token 药丸与提醒
- **打包版**：可写数据（config.json、自定义主题、替换素材、宠物形象与音效）重定向到系统 userData 目录（asar 只读）；`npm start` 开发模式写仓库文件（见 `src/userdata.js`）

### 设计取舍

- **参数化主题**：manifest + 参数模板驱动，一份模板、任意主题
- **素材文件名解耦**：素材内联为 data URI，换图只改槽位路径
- **实时应用**：`insertCSS` / `removeInsertedCSS` 切换样式，不重载页面、不丢对话状态
- **宠物穿透**：透明区 `setIgnoreMouseEvents` 穿透，判定区动态贴合形象
- **无对话/语音**：宠物轻量化，交互即时（基准：窗口创建→加载约 100ms）

### 已知边界

- **按钮道具图选择器**：依赖 CSS Modules 哈希，Harness 大改 DOM 后可能需微调 `template.css`；其上方的令牌覆盖永远有效
- **token 采集依赖文本**：统计行靠文本正则匹配，harness 改文案需同步 `inject.js`
- **授权面板**：`[data-approval-key]` 是当前接管面板信号，若 harness 改交互需同步选择器
- **后续引入的 skill / MCP / 工具参数**：建议统一放 `assets/pet/pet_skill/`
