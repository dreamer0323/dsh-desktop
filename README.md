# DeepSeek Harness Desktop

一个开箱即用的 DeepSeek Harness 桌面客户端。自动拉起 `dsh web` 并在原生窗口内显示网页界面，**无需打开浏览器**。内置透明桌宠、多主题、token 用量与授权提醒。

## ✨ 功能亮点

- **一键启动 dsh**：自动发现或引导安装 dsh，启动 / 停止 / 日志全自动，失败可一键重启
- **透明桌宠**：可拖拽、点击弹跳 + 音效；鼠标判定区贴合形象，透明区点击穿透到下层应用
- **多主题**：内置 **cirno**（默认）/ rinmu / marisa，图形化设置界面可创建、改色、换素材
- **实时信息**：桌宠显示内存/CPU，头顶药丸实时显示本轮输入/输出 token
- **提醒**：agent 请求批准时弹红色警示横幅，回答完成时桌宠提示「回答完毕」
- **免浏览器**：原生窗口内直接浏览 dsh 网页界面

---

## 🚀 快速开始（普通用户）

### 1. 下载

从仓库的 **Releases** 页面下载：

| 文件 | 说明 |
|---|---|
| `DeepSeek Harness Desktop Setup x.x.x.exe` | 安装版（推荐，可自选安装目录） |
| `DeepSeek Harness Desktop x.x.x.exe` | 便携版（双击即用，免安装） |

### 2. 首次使用（安装 dsh）

本程序是桌面外壳，运行前需要 **dsh 本体**（DeepSeek Harness）：

1. 安装 [Node.js 22+](https://nodejs.org/zh-cn)（一路默认即可）
2. 启动程序，若检测不到 dsh，加载页会显示 **「部署 dsh」** 按钮，点击即自动安装官方 dsh

> 也可以提前在命令行手动安装：`npm install -g @deepseek-ai/dsh`

### 3. 开始使用

启动后窗口加载 dsh 网页界面，桌宠常驻屏幕右下角。右键/侧边栏可切换主题、开关桌宠，详见 [THEME.md](THEME.md)。

### 常见问题（普通用户）

- **窗口一片空白** → 确认 Node.js 已安装、dsh 已部署（点「部署 dsh」）
- **提示未找到 dsh** → 点加载页的「部署 dsh」按钮一键安装
- **端口被占用** → 程序会自动回退到随机端口，无需处理

---

## 🖥️ 开发者指南

### 环境要求

- Node.js 22+
- （可选）一个本地 DeepSeek Harness 检出（需 `pnpm install` 并 `pnpm run build`，前端 dist 已构建）
- Windows / macOS / Linux（当前主要在 Windows 上开发验证）

### 安装与运行

```bash
npm install
npm start
```

首次启动会自动定位 dsh，按顺序：`config.command` → `config.harnessRoot` 检出 → 常见目录搜索（`~/dev`、`D:/dev` 等，可用 `DSH_SEARCH_ROOTS` 覆盖）→ `npx @deepseek-ai/dsh`（npm 包，无需全局安装）。

### 打包

```bash
npm run dist
```

产物输出到 `release/`（Windows 下生成 NSIS 安装包与便携单文件版）。

> 注意：桌面程序只是外壳，**不打包 Harness 本体**。打包后的程序运行时仍需要 Node.js 与 dsh（程序会引导安装，见「快速开始」）。

### 测试

```bash
npm test             # 单元 / 渲染 / 集成测试
npm run test:server  # dsh 无头冒烟测试
```

### 配置（config.json）

| 字段 | 说明 |
|---|---|
| `harnessRoot` | dsh 检出路径（留空则由程序自动发现，可写回） |
| `command` | 自定义启动命令（如 `["npx","@deepseek-ai/dsh","web"]`），留 `null` 走自动构建 |
| `nodeBin` | 启动 dsh 用的 node 可执行文件名（默认 `node`） |
| `port` | 监听端口（数字）或 `"auto"`（传 `--port 0` 并解析真实端口） |
| `extraArgs` | 追加给 `dsh web` 的额外参数 |
| `env` | 追加给 dsh 进程的环境变量 |
| `window` | 主窗口宽高 |
| `theme` | `{ enabled, name }` —— 当前主题 |
| `pet` | 桌宠参数（宽高、`tokens` / `notify` 开关） |

- **开发模式**（`npm start`）：配置读写仓库的 `config.json`
- **打包版**（exe）：写系统 userData 目录（`%APPDATA%\dsh-desktop`），asar 内只读

### 项目结构

```
src/main.js            # 主进程：窗口管理、生命周期、IPC
src/server.js          # dsh web 进程控制（拉起/解析就绪地址/日志/停止）
src/detect.js          # dsh 自动发现（检出搜索 + npm 包探测）
src/config.js          # 配置加载 / 写回
src/theme.js           # 主题管理器（清单/渲染/注入/素材替换）
src/theme-params.js    # 主题参数系统（友好参数 ↔ 完整 token 字典）
src/pet.js             # 桌宠窗口（透明、置顶、鼠标穿透）
src/userdata.js        # 可写数据覆盖层（打包版重定向到 userData）
ui/                    # 渲染层：loading（启动页）/ settings（设置）/ pet（桌宠）
assets/themes/         # 内置主题目录（cirno / rinmu / marisa）
scripts/install-dsh.*  # dsh 一键部署脚本
test/                  # 测试
```

### 常见问题（开发者）

- **Electron 二进制下载失败**（国内网络）：设置镜像后重试
  ```powershell
  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
  node node_modules/electron/install.js
  ```
- **打包时二进制下载失败**：设置 `ELECTRON_BUILDER_BINARIES_MIRROR = https://npmmirror.com/mirrors/electron-builder-binaries/` 后重跑 `npm run dist`

---

## 📖 文档

- [THEME.md](THEME.md) — 主题系统与桌面宠物完整说明（用户 + 开发者）

## 📄 许可与声明

- 主题内素材为个人学习的自制占位素材，请替换为你有使用权的图片与音频后再对外分发
