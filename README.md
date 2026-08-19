# DeepSeek Harness Desktop

一个 Electron 桌面外壳，封装 DeepSeek Harness 的 "dsh web" 命令：程序自动启动/停止 Web 服务，并在原生窗口内直接显示 Web 界面，无需手动打开浏览器。

## 它做什么

- 启动时自动拉起 "dsh web"（默认执行 node --import tsx/esm apps/cli/src/bin.ts web）
- 从标准输出解析就绪地址（形如 "dsh web: http://127.0.0.1:PORT"）
- 就绪后在应用窗口内加载该地址
- 启动过程显示状态与实时日志；失败时显示错误并可一键重启
- 关闭窗口时停止服务进程树
- 单实例锁：重复启动只会聚焦已有窗口

## 前置条件

- Node.js 22+（与 Harness 要求一致）
- 一个可运行的 DeepSeek Harness 仓库（已 pnpm install 且已 pnpm run build，前端 dist 已构建）
- Windows / macOS / Linux 均可（本项目当前在 Windows 上开发与验证）

## 安装

在项目目录执行：

    npm install

## 运行

    npm start

首次启动会读取 config.json，按其 harnessRoot 指向的仓库拉起服务。

## 配置（config.json）

- harnessRoot：Harness 仓库路径（默认 D:/dev/agent/dsh/deepseek-harness，也可用环境变量 DSH_HARNESS_ROOT 覆盖）
- command：可选，完全自定义启动命令（数组形式，例如 ["npx", "@deepseek-ai/dsh", "web"]）；留 null 则自动构建
- nodeBin：启动 Harness 用的 node 可执行文件名（默认 node，从 PATH 解析）
- port：监听端口，数字（如 3080）或 "auto"（传 --port 0 并从日志解析真实端口）；固定端口被占用时自动回退到自动端口
- extraArgs：追加给 "dsh web" 的额外参数数组
- env：追加给 Harness 进程的环境变量
- window：窗口宽高

## 打包成可执行程序

    npm run dist

产物输出到 release/（Windows 下生成 NSIS 安装包与 portable 单文件版）。

注意：桌面程序只是外壳，并不会把 Harness 本体打包进去。打包后的程序仍依赖：

1. 系统 PATH 里有 node；
2. 配置指向一个可运行的 Harness 仓库（或通过 command 使用 npx）。

## 工作原理

1. 主进程 src/main.js 创建窗口并启动 DshServer（src/server.js）。
2. DshServer 以 harnessRoot 为工作目录，子进程运行 "dsh web"，逐行读取输出并解析就绪 URL。
3. 就绪后窗口从本地加载页（ui/loading.html）跳转到该 URL。
4. 关闭窗口 / 退出时终止服务进程树。

## 注意事项

- 关闭窗口会立即结束 Harness 进程（Windows 上 Node 无法向子进程投递 SIGTERM/SIGINT 的处理器，因此用 taskkill /T /F 结束整棵进程树）。建议在对话回合完成后再关闭。
- 单实例锁防止多开；如需同时运行多实例，请为每个实例配置不同的端口和 DSH_HOME。
- 首次启动较慢：Harness 通过 tsx 即时转译加载大量插件，属正常现象。

## 常见问题

- npm install 后 Electron 二进制下载失败（fetch failed）：GitHub 源不稳定时，用国内镜像重下：

    $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
    node node_modules/electron/install.js

- 打包时二进制下载失败：设置 ELECTRON_BUILDER_BINARIES_MIRROR = https://npmmirror.com/mirrors/electron-builder-binaries/ 后重试 npm run dist。

- 窗口加载后一片空白：确认 Harness 前端已构建（pnpm run build），且 config.json 的 harnessRoot 指向正确仓库。

# 项目结构

## 交付结果

**可执行程序**：`release\DeepSeek Harness Desktop 0.1.0.exe`（85.5 MB，便携版，双击即用）

**项目源码**位于 `D:\dev\agent\agent_dev\dsh_dev`，核心文件：

- `src\main.js` — Electron 主进程：窗口管理、进程生命周期、IPC（含主题设置窗口与 `dsh:theme:*` 处理器）
- `src\server.js` — `dsh web` 控制器（拉起/解析就绪地址/日志/停止），纯 Node 可无头测试
- `src\config.js` / `config.json` — 配置加载、默认配置与写回（`writeConfig`）
- `src\preload.js` — 渲染层桥接（getState/onStatus/onLog/restart/quit/pet/主题设置入口）
- `src\preload-settings.js` — 主题设置窗口桥（`dshTheme.*`）
- `src\theme.js` — 通用主题管理器：清单/渲染/注入/素材替换/创建删除
- `src\theme-params.js` — 主题参数系统：友好参数 ↔ 完整 token 字典展开
- `ui\loading.html` / `loading.css` / `loading.js` — 启动/状态/日志界面（深色主题）
- `ui\settings.html` / `settings.css` / `settings.js` — 主题设置图形化界面
- `assets\themes\marisa\theme.json` + `template.css` — 主题清单（参数 + 素材槽位）与参数化模板
- `test\server-smoke.mjs`、`test\theme-smoke.js`、`test\pet-inject.test.js` — 冒烟 / 主题 / 注入测试
- `README.md` — 使用与打包文档

## 它如何工作

1. 启动时自动执行 `node --import tsx/esm apps/cli/src/bin.ts web`（封装了 `dsh web` 命令）
2. 从 stdout 解析就绪行 `dsh web: http://127.0.0.1:PORT`
3. 就绪后在原生窗口内直接加载该地址，**无需打开浏览器**
4. 启动过程显示状态 + 实时日志；失败显示错误可一键重启；关闭窗口即停止服务进程树
5. 带单实例锁、固定端口被占用时自动回退到系统分配端口

## 验证结果（均已实测通过）

- 无头冒烟测试：`dsh web --port 0` 成功拉起 → 解析出真实端口 → `GET /` 返回 200
- 端到端测试：真实启动 Electron 应用 → 检测到 3080 被占用自动回退 → 加载页面返回 200 → 干净退出
- 打包：electron-builder 成功产出 portable 单文件 exe

## 使用方式

- **开发运行**：`cd D:\dev\agent\agent_dev\dsh_dev && npm start`
- **重新打包**：`npm run dist`（会同时产出 NSIS 安装包与 portable 版）
- 直接双击 `release\DeepSeek Harness Desktop 0.1.0.exe` 即可

## 主题系统与桌面宠物

桌面外壳内置了**可参数化主题系统**（默认「雾雨魔理沙」黑金主题，可换背景图/按钮道具图/音效）和一个透明置顶桌面宠物。**全部实现位于桌面外壳内，不改动 Harness 源码**。

**主题设置图形化界面**（无需手改配置文件）：

- 主界面右侧「主题」标签页 → 打开原生设置窗口
- **创建主题**：以魔理沙为模板，输入名称即克隆；之后可调配色、换素材
- **外观参数**：按分组改颜色/遮罩（基础/强调/文字/语义/背景），保存即实时生效（不重载页面）
- **素材替换**：每个槽位原生文件选择器选本机图片/音频 → 自动复制并应用；支持音效试听、宠物形象替换
- 自定义主题的 manifest 与参数展开逻辑见 `src/theme.js`、`src/theme-params.js`

> 打包版（exe）里 `config.json`、自定义/被修改的主题、替换的素材与宠物形象都存储在系统 **userData 目录**（`%APPDATA%\dsh-desktop` 等，因 asar 只读）；内置主题仍作为只读默认。开发模式（`npm start`）写回仓库文件，两者自动切换。

宠物 v4 能力（**轻量、无对话、无语音**）：

- **静态 Marisa Fumo 形象**（单帧、无动画）、可拖拽、实时播报内存/CPU
- **回合完成提醒**：主窗口对话完成时宠物弹「回答完毕」（只提示、不抓内容）
- **token 用量**：头顶金色药丸实时显示本轮 `输入 / 输出` token
- **授权提醒**：agent 请求批准时弹红色警示横幅 + 双音 + 系统通知
- **侧边栏开关**：主界面右侧「宠」标签页，一键显示/隐藏桌宠

> 对话与语音模块已按用户要求移除（问答原走 harness agent 全链路，是"慢"的唯一来源；删除后宠物交互即时）。基准：窗口创建→加载约 100ms，内存主要来自 Electron 运行时。

- 开关与参数：`config.json` 的 `theme` / `pet` 字段（`theme.name` 为当前主题，切主题时自动写回；`pet.tokens/notify` 可单独关）
- 主题/素材/数据链路/性能基准：见 [`THEME.md`](THEME.md)
- 素材为个人学习用的同人占位，替换为你有使用权的图片与音频即可
- 后续引入的 skill / MCP / 工具参数统一放 `assets/pet/pet_skill/`

