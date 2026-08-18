---
name: touhou-marisa-character-generator
description: >-
  当用户提及以下任意关键词组合时，自动加载本技能：
  「雾雨魔理沙 / 魔理沙 / Marisa」；「东方 + 角色 / 桌宠 / 立绘」；
  「生成角色图 / 人物设计」。
  用于为雾雨魔理沙（Kirisame Marisa, Touhou Project）生成符合官方设定的
  AI 图像提示词（Stable Diffusion / NovelAI 等），供桌宠 / 立绘 / 同人使用。
---

# Touhou Marisa Character Generator

## 1. 技能触发条件

当用户提及以下任意关键词组合时，自动加载本技能：

- 雾雨魔理沙 / 魔理沙 / Marisa
- 东方 + 角色 / 桌宠 / 立绘
- 生成角色图 / 人物设计

## 2. 角色说明书（Character Sheet）

这是 Agent 必须严格遵循的核心设定文档。在生成任何图像前，必须先「通读」并「记住」以下所有特征：

| 类别 | 字段 | 内容与描述 |
|---|---|---|
| 身份 | 角色名 | 雾雨魔理沙 (Kirisame Marisa) |
| | 所属作品 | 东方Project (Touhou Project) |
| | 种族 | 人类 (魔法使) |
| | 性格标签 | 努力家、率直、不服输、喜欢恶作剧、收藏癖 |
| 外貌 | 发型 | 金色长发 (Long blonde hair)，左侧扎有麻花辫 (Side braid) |
| | 眼睛 | 琥珀色/金色 (Yellow eyes) |
| | 帽子 | 巨大的黑色魔法帽 (Oversized black witch hat)，系有巨大的白色蝴蝶结 (Large white bow) |
| 服装 | 主色调 | 黑与白 (Black and White) |
| | 上衣 | 白色衬衫 (White blouse)，黑色背心 (Black vest) 缀金色纽扣 |
| | 下装 | 黑色长裙 (Black skirt) 带白色荷叶边，外罩白色围裙 (White waist apron) |
| | 鞋袜 | 白色过膝袜 (White thighhighs)，黑色系带靴 (Black lace-up boots) |
| 道具 | 常持物品 | 魔法扫帚 (Magic Broom) / 迷你八卦炉 (Miniature Hakkerou) |
| 配色 | 主色 | `#FFD700` (金发), `#000000` (黑衣), `#FFFFFF` (白衣) |

## 3. 基础提示词模板（Base Prompt Template）

Agent 必须基于以下结构生成最终提示词，替换 `[动作描述]` 部分：

```txt
masterpiece, best quality, very aesthetic, anime style, 1girl, solo, 
(Kirisame Marisa:1.2), (Touhou Project:1.1), 
long blonde hair, side braid with a small white hair bow, yellow eyes, 
(oversized black witch hat with a large white bow:1.2), 
(black vest with gold buttons:1.1), white blouse with puffy short sleeves, 
black skirt with a white ruffled hem, white frilled waist apron, 
white thighhighs, black lace-up boots, 
holding a [道具，如魔法扫帚/八卦炉], 
[动作描述，如：flying on broom / casting spell / sitting / waving],
dynamic pose, looking at viewer, 
[画风要求，如：bright lighting, cel shaded, vibrant colors]
```

## 4. 完整工作流示例（含提示词）

**场景：生成「坐在扫帚上飞行的魔理沙」**

**Step 1: Agent 读取角色设定**

（心中默念：金色长发，巨大蝴蝶结帽子，黑白服装...）

**Step 2: Agent 生成完整正向提示词**

```txt
masterpiece, best quality, very aesthetic, anime style, 1girl, solo, (Kirisame Marisa:1.2), (Touhou Project:1.1), long blonde hair, side braid with a small white hair bow, yellow eyes, oversized black witch hat with a large white bow, black vest with gold buttons, white blouse with puffy short sleeves, black skirt with a white ruffled hem, white frilled waist apron, white thighhighs, black lace-up boots, holding a magic broom, sitting sideways on broom, flying in the sky, dynamic pose, wind blowing hair, looking back at viewer, smiling, bright lighting, blue sky background, cel shaded, vibrant colors
```

**Step 3: 生成高质量负面提示词**

Agent 必须默认附带以下负面提示词：

```txt
Negative prompt: lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name, easynegative, ng_deepnegative_v1_75t, bad_prompt_version2-neg
```

## 5. 生成规则

- 输出时**必须**同时给出正向提示词与负面提示词。
- 正向提示词中，角色特征（金发、大蝴蝶结帽、黑白服装、道具）不允许删改，只允许替换 `[道具]`、`[动作描述]`、`[画风要求]` 三处占位。
- 若用户没有指定动作，默认使用 `dynamic pose, looking at viewer`。
- 若用户要求「为桌宠 / 立绘使用」，优先选择**全身、正面/略侧、透明背景友好**的构图。
