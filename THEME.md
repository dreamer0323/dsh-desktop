# 主题系统 + 桌面宠物

桌面外壳内置了一套**可参数化主题系统**（默认提供「雾雨魔理沙」黑金主题）和一个透明置顶桌面宠物。**全部实现都在桌面外壳内**（Electron 注入 + 多窗口），不改动 Harness 源码——因此它能在 Harness 每次重建后原样工作。

> 版权提醒：魔理沙是 ZUN 的角色，同人图/语音均有版权。仓库内提供的都是**自制占位素材**；请只使用你有使用权的图片与音频。

## 一、它做了什么

| 功能 | 实现 |
|---|---|
| Marisa 配色 | 覆盖 `--dsw-alias-*` 设计令牌（黑/白/金 + 八卦炉暖橙） |
| 背景图 | `body[data-ds-<name>]` 注入背景图 + 暗化遮罩，面板改半透明让图透出 |
| 按钮道具图 | 主按钮=金色八卦炉渐变；图标按钮=魔法星点缀（`:has()` 选择器） |
| 事件音效 | WebAudio 合成占位音：click / hover / complete / error / auth（可换成真音频） |
| **主题设置界面** | 右侧「主题」标签页打开原生设置窗口：**创建主题 / 调整参数 / 替换素材**，全部图形化，无需手改配置文件 |
| **创建主题** | 以魔理沙为模板克隆，参数化生成新主题（配色/背景/素材独立） |
| 桌面宠物 | 独立透明置顶窗口，**静态 Marisa Fumo 形象**（无动画）+ 拖拽 + 内存/CPU 实时播报 |
| 回合完成提醒 | 检测网页 `[data-streaming]` 回合信号 → 宠物弹「回答完毕」（**不含对话内容**） |
| token 用量 | 轮询对话区 `输入 X tok · 输出 Y tok` 统计行 → 宠物头顶金色 token 药丸 |
| 授权提醒 | 检测 `[data-approval-key]` 接管面板（agent 请求批准）→ 红色警示横幅 + 气泡 + 提示音 + 系统通知 |
| 侧边栏开关 | 主界面右侧注入「宠 / 主题」标签页：一键显示/隐藏桌宠、打开主题设置 |

## 二、主题是怎么运作的

每个主题是一个目录 `assets/themes/<name>/`：

```
assets/themes/marisa/
├─ theme.json           # 主题清单：显示名、完整参数、素材槽位（路径）
├─ template.css         # 参数化样式表：{{token}} 占位符由 theme.json 渲染
├─ inject.js            # 运行时（音效 / 回合 / token / 授权 / 侧边栏标签页）
├─ images/*             # 背景图、按钮道具图（可经设置界面替换）
└─ sounds/*             # 事件音效（可经设置界面替换）
```

渲染流程（`src/theme.js`）：读取 `theme.json` 的 `params` → 填充 `template.css` 的 `{{token}}` → 把素材槽位（背景图/道具图/音效）内联为 `data:` URI → 注入页面。**文件名与内容解耦**：你在本机选的任意图片/音频都会被复制进主题目录，无需约定文件名。

- 参数系统在 `src/theme-params.js`：设置界面编辑**友好参数**（基础色/强调色/文字/语义色/遮罩），保存时展开为完整 `--dsw-alias-*` token 字典（rgba 变体、悬停态自动派生）。**默认值就是魔理沙原始取值**，不改任何参数时渲染结果与旧版完全一致。
- 素材槽位：`background`（背景图）、`props.*`（star/hakkero/broom/hat/mushroom 道具图）、`sounds.*`（click/hover/complete/error/auth 音效）。
- **全局素材**（不属于某个主题，全 dsh-desktop 生效）：`pet` 宠物形象（`assets/pet/marisa-fumo.png`）与 `pet-sound` **宠物点击音效**（`assets/pet/pet-click.*`）——点击桌宠会弹跳并播放该音效；未设置时用合成音。

## 三、如何使用设置界面（推荐）

1. 启动桌面壳，主界面右侧点击 **「主题」** 标签页 → 打开主题设置窗口。
2. **切换主题**：左侧主题列表点击即可编辑；点「设为当前」立即应用。
3. **创建主题**：左下输入主题名（如 `mytheme`）→「创建主题」→ 以魔理沙为模板克隆并自动切换。之后可：
   - **调整参数**：右侧「外观参数」按分组改颜色/遮罩，点「保存并应用」即时生效（**不重载页面、不丢对话**）。
   - **替换素材**：每个槽位显示缩略预览 + 「选择图片/音频」按钮 → 原生文件选择器选本机文件 → 自动复制进主题目录并应用。音效可试听；宠物形象 / 宠物点击音效替换后宠物窗口自动刷新。
   - **高级**：折叠区可查看/编辑完整参数 JSON，支持自定义任意 token。
4. **删除主题**：仅自定义主题可删（内置 marisa 与当前生效主题不可删）。

也可以手动在 `assets/themes/<name>/theme.json` 里改 `params`/`assets`，效果等同。

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

`theme.name` 是当前生效主题，切主题时由设置界面自动写回。`statsIntervalMs` 是宠物刷新内存/CPU 的间隔。

> 打包版（exe）中可写数据（`config.json`、自定义主题、替换的素材、宠物形象与点击音效）重定向到系统 userData 目录（asar 只读）；`npm start` 开发模式仍写仓库文件。切换逻辑见 `src/userdata.js`。

> 桌面壳不依赖固定路径：启动时自动检索 dsh（本地检出 / `npx @deepseek-ai/dsh`），找不到时加载界面出现「部署 dsh」按钮；一键部署脚本见 `install-dsh.cmd`（详见 [README.md](README.md) 的「dsh 部署」）。

## 五、运行与验证

```powershell
cd D:\dev\agent\agent_dev\dsh_dev\dsh_desktop
npm start
```

预期效果：启动页之后，主界面变为魔理沙黑金配色 + 背景图；右侧出现「宠 / 主题」标签页；右下角出现一只可拖动的 **Marisa Fumo**（静态，无动画），气泡显示 `内存 x% · CPU y%`；点击按钮有提示音；一次对话生成完成时宠物弹「回答完毕」；agent 请求授权时宠物弹红色警示横幅 + 双音提醒 + 系统通知；宠物头顶金色 token 药丸实时刷新。点击「主题」标签页可打开设置界面，创建新主题、改色、换素材即时生效。

## 六、数据链路（inject.js 注入式，不改 harness 源码）

桌面壳在 harness 页面里注入的 `inject.js` 负责采集信号并经 preload 桥转发给宠物：

| 能力 | 信号来源（harness web 前端） | 转发 |
|---|---|---|
| 回合完成 | `[data-streaming]` 助手消息根节点出现/消失（只看出现与否，**不读内容**） | `dsh:turn {state:'done'}` → 宠物「回答完毕」 |
| token 用量 | 对话区统计行文本 `输入 X tok · 输出 Y tok`（`[data-composer-seat]` 下） | `dsh:pet {kind:'tokens'}` → token 药丸 |
| 授权请求 | 接管面板 `[data-approval-key]` / `[data-approval-scroll]`（按钮：拒绝/允许一次） | `dsh:pet {kind:'auth'}` → 红色横幅 + 双音 + 系统通知 |
| 侧边栏开关 | 右侧「宠」标签页 → `window.dsh.togglePet()` | `dsh:pet-toggle` / `dsh:pet-state` → 显示/隐藏 |
| 主题设置 | 右侧「主题」标签页 → `window.dsh.openThemeSettings()` | `dsh:open-theme-settings` → 打开设置窗口 |

## 七、设计取舍

- **参数化主题**：主题由 manifest + 参数模板驱动，一份模板、任意主题；`expandParams` 从少量友好参数派生全部 token，无需逐项手填。
- **素材文件名解耦**：素材一律内联为 data URI，换图只改 manifest 槽位路径，不碰样式表。
- **实时应用**：`insertCSS` 返回 key，切换/保存时 `removeInsertedCSS` 旧样式 + 插入新样式，不重载页面、不丢对话状态。
- **删除对话/语音**：宠物无聊天面板与 TTS，主窗口任何回合完成只弹「回答完毕」；宠物交互即时。
- 基准：宠物窗口创建→加载约 100ms；宠物本体静态图，CPU 空闲近 0，仅 2s stats / 4s token / 2s 授权轮询。

## 八、已知边界 / 后续可做

- **按钮图片选择器**：`button:has(> span > svg)` 依赖 CSS Modules 哈希，Harness 大改 DOM 后可能需微调 template.css；其上方的**令牌覆盖永远有效**，承担了绝大部分观感。
- **宠物点击穿透**：宠物窗口整块矩形会挡住下层点击；透明区域穿透需渲染层上报 hover 再由主进程切换 `setIgnoreMouseEvents`。
- **token 采集依赖文本**：统计行只有 CSS 哈希 class，靠文本正则匹配；若 harness 改文案需同步 `inject.js` 的正则。
- **授权面板**：`[data-approval-key]` 是 harness 当前接管面板的信号；若改成弹窗/新增 pending 类型需同步选择器。
- **下载的工具参数**：后续在本仓库引入的 skill / MCP / 工具清单建议放 `assets/pet/pet_skill/`。
