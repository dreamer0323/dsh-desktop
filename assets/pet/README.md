# 桌面宠物素材

pet v3 已从「精灵图动画」改为**静态单帧**：桌面宠物就是一只 Marisa Fumo（雾雨魔理沙玩偶）。

## 当前素材

- `marisa-fumo.png` —— 宠物形象本体（透明背景 PNG，800×800）。
  源图来自 `image/marisa-fumo.webp`，经 `make-fumo.cjs` 边缘泛洪抠背景成透明图。
  重新处理：`node assets/pet/make-fumo.cjs`
- 换图：直接覆盖 `marisa-fumo.png`（建议 1:1 方形、透明背景），宠物窗口自动生效。

## 已废弃：动画帧（legacy-anim/）

旧精灵图方案（`idle/speak/happy` 序列帧 + `make-frames.cjs` 生成器）已放弃，
归档在 `assets/pet/legacy-anim/` 备查。宠物渲染层不再读取这些帧。

## pet_skill/

第三方工具 / skill / MCP 参数配置，见 [pet_skill/README.md](pet_skill/README.md)。
