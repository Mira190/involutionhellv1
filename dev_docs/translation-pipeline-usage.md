# 翻译流水线（zh → en）操作指南

`pnpm translate:docs` 扫描 `content/docs` 下的中文源文件（不带语言后缀的
`.md/.mdx`，或显式 `.zh.md/.zh.mdx`），按 ATX 标题切段，逐段翻译成对应的
`.en` 文件。段级翻译记忆（TM）保证只有变过的段才会重新调用模型；三方保护
保证人工润色过的 `.en` 段落不会被静默覆盖。

## 模式与环境变量

| 变量                | 默认              | 含义                                                                                                 |
| ------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| （无）              | DRY_RUN           | 默认即 dry run：只打印会发生什么（文件数、段数、TM 命中/未命中、冲突），不写任何文件，不调用任何 API |
| `APPLY=1`           | —                 | 真正执行：写 `.en` 文件、更新 TM、重新生成冲突报告。需要 `ANTHROPIC_API_KEY`，除非 `PROVIDER=mock`   |
| `PROVIDER`          | `anthropic`       | `anthropic` 走 Messages API；`mock` 用确定性伪翻译（测试/演练用，无需 key）                          |
| `ANTHROPIC_API_KEY` | —                 | `APPLY=1` 且 `PROVIDER=anthropic` 时必需                                                             |
| `TRANSLATE_MODEL`   | `claude-opus-4-8` | 翻译模型 id，写入目标 frontmatter 的 `translatorAgent` 和 TM 条目                                    |
| `ONLY=子串`         | —                 | 只处理源路径包含该子串的文件，如 `ONLY=career/events`                                                |
| `ADOPT_CONFLICTS=1` | —                 | 冲突段不再保留待办，而是把当前 `.en` 文本采纳进 TM（见下文"解决冲突"）                               |

常用命令：

```bash
pnpm translate:docs                        # dry run，看计划
APPLY=1 pnpm translate:docs                # 全量执行（需 ANTHROPIC_API_KEY）
APPLY=1 ONLY=projects pnpm translate:docs  # 只跑 projects 目录
APPLY=1 PROVIDER=mock pnpm translate:docs  # 无 key 演练完整写盘路径
```

源文件 frontmatter 写 `noTranslate: true` 可整篇跳过。

## 翻译记忆：`generated/translation-memory.json`

结构：`{ version: 1, entries: { [docId]: { [源段 hash]: { target, targetHash, model, at } } } }`。

- 段 hash = 归一化内容（去每行行尾空白、去末尾空行）的 sha256，所以纯空白
  改动不会触发重翻。时间戳在本仓库不可信，hash 是唯一的过期判据。
- 序列化按 key 排序，diff 稳定。**必须 commit 进 git** —— 它是"哪些段已翻
  译过"的唯一事实来源。
- `model` 字段标注条目来源：模型 id / `adopted`（首跑收编已有 `.en` 文件）/
  `human`（采纳人工编辑）。

首次 `APPLY=1` 运行不会重翻已有的 151 篇 `.en` 文档：TM 为空且 `.en` 已存
在时，按段位置对齐并整体收编进 TM（`adopted`），零 API 调用。

## 三方保护（源、TM、当前 `.en` 三方对比）

对每个段（含 frontmatter 的 title/description 两个伪段）：

| 源段                 | 当前 `.en` 段      | 行为                                                          |
| -------------------- | ------------------ | ------------------------------------------------------------- |
| 未变（hash 命中 TM） | 与 TM 记录一致     | 复用 TM，零调用                                               |
| 未变                 | 被人工改过         | **采纳人工文本**：保留 `.en`，TM 的 targetHash 更新为人工版本 |
| 已变                 | 是 TM 里的机器文本 | 重新翻译并覆盖                                                |
| 已变                 | 被人工改过         | **冲突**：保留人工文本，不翻译，记入冲突报告                  |

段数对不上且目标含 TM 之外的内容时无法逐段对齐，整篇跳过并记一条
`(document)` 级冲突。

## 冲突报告：`generated/translation-conflicts.md`

每次 `APPLY=1` 运行整体重新生成（只反映最近一次运行），每条含 docId、标题、
原因。解决一条冲突：

1. 打开对应 `.en` 文件，把源文件的改动人工合并进该段（保留你想要的措辞）。
2. 重跑 `ADOPT_CONFLICTS=1 APPLY=1 pnpm translate:docs`（可加 `ONLY=` 限
   定范围）——当前 `.en` 文本会以 `human` 身份写入 TM，冲突消失。
3. 或者：如果人工改动不值得保留，直接把 `.en` 段改回机器文本再重跑，该段
   会被正常重翻。

placeholder 校验失败（模型弄丢了 `⟦PHn⟧` 保护 token，重试一次仍失败）也会
记入冲突报告，该段在输出里保留中文原文，等下次运行重试。

## 生成的 `.en` frontmatter

继承源文件全部字段，并翻译 `title` / `description`，追加：
`lang: en`、`translatedFrom: zh`、`sourceHash`（整篇源 body 的 hash）、
`translatorAgent`（模型 id）、`sourcePath`（仓库相对源路径）。不写
`translatedAt` —— 时间戳不可信，过期判断只看 hash。
