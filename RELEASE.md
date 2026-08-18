# 发布流程（标准化）

一条命令完成「测试 → 打包 → 打 tag → 上传 GitHub Release」。

```bash
node scripts/release.mjs            # 完整发布
node scripts/release.mjs --dry-run  # 只做 测试+打包+tag，不上传（默认建议先跑）
```

## 流程明细（release.mjs）

| 步骤 | 动作 | 产出 |
|---|---|---|
| 1 | `npm test` | 质量门禁（theme / inject / render） |
| 2 | `npm run dist` | `release/` 下 NSIS + portable 的 `.exe` |
| 3 | 校验产物 | 无 `.exe` 即中止 |
| 4 | 提交 + 打 tag | `git commit -m "chore: release vX.Y.Z"` + `git tag vX.Y.Z` |
| 5 | 上传 GitHub | `gh release create`（推荐）或 `GITHUB_TOKEN` REST API |

## 前置条件

1. **网络可达 GitHub**（中国大陆网络默认不可达，需代理；可设 `HTTPS_PROXY`）。
2. **发布工具二选一**：
   - `gh` CLI：`winget install GitHub.cli` 后 `gh auth login`（推荐）；
   - 或环境变量 `GITHUB_TOKEN`（GitHub → Settings → Developer settings → Personal access tokens）。
3. 版本号在 `package.json` 的 `version`，tag 用 `v<version>`。

## 日常建议

- 先 `node scripts/release.mjs --dry-run` 本地验证（测试+打包+tag 都不需要网络）。
- 网络恢复后，补发：`node scripts/release.mjs --skip-tests --skip-build`（只 push + 建 Release）。
- 打包二进制下载失败时用镜像：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 与 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`。
