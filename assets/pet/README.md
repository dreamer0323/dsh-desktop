# 桌面宠物精灵图

把你**拥有使用权**的魔理沙序列帧放到这个目录，按 `姿势-序号.png` 命名。
帧数 / 帧率在 `ui/pet.js` 顶部的 `SPRITES` 清单里调整。

```
idle-0.png  idle-1.png  idle-2.png  idle-3.png   # 待机（默认 4 帧，5 fps）
speak-0.png speak-1.png                          # 说话（默认 2 帧，7 fps）
happy-0.png happy-1.png                          # 开心（默认 2 帧，7 fps）
```

- 建议使用透明背景 PNG，尺寸约 240×280（与窗口一致）。
- 未放置任何帧时，自动显示内置 SVG 兜底吉祥物。
- 命名中的 `-N` 从 0 开始连续编号。
