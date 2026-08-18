# pet_skill —— 宠物开发用工具参数

本目录存放后续为 pet 组件开发引入 / 下载的 skill、MCP 服务、工具清单等**参数配置**（例如
MCP server 的 `.json` 配置、skill 说明、第三方工具参数模板）。

约定：

- 只放「参数/清单/说明」类文件，不放代码；运行时代码仍在 `src/` 与 `ui/`。
- 每个工具一个子目录或一个 `.md` 说明，标注用途、安装方式、来源。

## 已收录

### `image-gen/` —— 文生图 MCP 服务器（2026-08-18）

- 用途：为角色立绘 / 桌宠素材生成 AI 图像。
- 后端：**Pollinations.ai**（免费、免密钥，FLUX/SDXL）。首次请求未缓存会返回空 200，
  服务器已内置 5 次重试（间隔递增）直到出图。
- 工具：`generate_image(prompt, negative?, width?, height?, model?, seed?, filename?)`
  → 返回 base64 图像 + 本地保存路径（存到 `<项目>/image/gen/`）。
- 注册：项目根 `.mcp.json` 的 `image-gen` 条目（command: node, args: server.mjs）。
- 测试：`node assets/pet/pet_skill/image-gen/test-client.mjs`
- 调用示例：见 `test-client.mjs` 里的 `MARISA_PROMPT`。

