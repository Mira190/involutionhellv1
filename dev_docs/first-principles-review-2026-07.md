# 交付后第一性原理复盘（2026-07-19）

> 对本轮交付的 15 个分支（11 个 issue 分支 + 4 个 blindspot phase 分支）
> 做一次批判性复盘：不看"做了什么"，只看"哪里站不住"。每条都先给结论，
> 再给证据与修正方向。已与最新 main（`7a3a5e4`）比对，0 落后 commit。

## 新事实：main 已切双协议（本轮分析的前提变了一half）

`a051f04` 把仓库改为 **代码 Apache-2.0 + 文档内容 CC BY-NC-SA 4.0** 双协议。
盲点分析文档 §6 的许可结论按"全仓 CC"写成——**内容侧结论不变**（翻译仍是
CC 内容的演绎作品，SA 传染仍成立），但流水线代码本身（scripts/lib）现在
落在 Apache-2.0 侧，反而更干净。需要改的只有表述，不需要改任何实现。

## P1（真缺陷，应在合并前或合并后立刻修）

### 1. 锚点钉扎从计划里静默丢失了

盲点分析 §7 Phase 1 第 4 条（给 zh heading 注入 `[#slug]` 显式 id，让
zh/en 锚点恒等）**没有出现在任何已交付分支里**（对 phase3-4 分支 grep
`\[#` = 0）。这不是小遗漏：

- 它是差异化清单（§4 gap 5）里生态全空白的一项；
- 它同时是**对齐脆弱性的解药**——当前三方保护按"位置"对齐 zh/en 段落，
  7 个 doc 因段数不一致整篇跳过。若段落带显式 id，对齐可以按 id 而不是
  位置，人加一节、删一节都不再打散整篇。
- **修正**：新增 Phase 1.5 分支——(a) codemod 给全部 zh 原文 heading 注入
  `[#<现有 slug>]`（fumadocs 支持该语法，slug 用与今天完全相同的
  github-slugger 值，**URL 零变化**）；(b) `segmentMdx` 解析显式 id 并把
  segment key 从位置改为 id；(c) translate-core 对齐逻辑跟随。7 个
  unalignable doc 应当在此之后重新对齐再人工复核。

### 2. fence 字节等同硬门与语料现实冲突，照单执行会把英文文档改差

Phase 2 的 87 个 fence-integrity error 全是**旧翻译把代码注释翻成了英文**。
门禁按"fence 必须字节等同"判错——但对英文读者，翻译注释是改善不是缺陷。
若有人照着报告"清零"，操作将是把英文注释改回中文，**负价值**。

- 根因：把"新流水线的构造性保证"（placeholder 让 fence 不可能变）直接
  当成了"存量语料的正确性标准"。两者不是一回事。
- **修正**：fence 门拆两级——代码 token 序列（去注释后）不等 → error；
  仅注释差异 → 降为 info/威warning 并标注 "translated-comments"。需要一个
  按 fence info string 选注释语法的最小注释剥离器（`//`、`#`、`--`、
  `/* */` 够覆盖语料 95%）。在此之前，87 条不应作为"待修清单"分发。

### 3. 翻译成本模型与研究结论脱节

研究明确结论（§5）：Sonnet 级 + **Batches API 五折** + 缓存 glossary
前缀。实际交付：默认模型 `claude-opus-4-8`（约 5× Sonnet 单价）、逐条
Messages 调用（无 batch，grep "batch" = 0）、system prompt 未设计成可
缓存的稳定前缀结构。当前欠翻量小（183 段）差额无所谓，但全量重翻场景
（比如未来换模型）会按 10× 于必要成本执行。

- **修正**：默认 `TRANSLATE_MODEL` 改 Sonnet 当前版本；≥50 段的 APPLY
  自动走 Message Batches；system prompt 固定前缀 + 文档内容后缀的结构
  即可白得 cache 命中。均为 provider 层局部改动。

## P2（结构性弱点，下个迭代修）

### 4. 术语一致性只靠 TM 复用，没有 glossary 机制

计划里的"glossary 放缓存前缀"没有实现（grep glossary = 0）。TM 只保证
"同一段不重翻"，不保证"新段落里 Transformer/微调/量化 的译法与旧段一致"。
WMT25 证据是 glossary 注入对术语准确率是因果性提升。
**修正**：`generated/translation-glossary.json`（从已 adopt 的 1513 段
TM 里挖高频术语对生成初版）→ 注入 system prompt 前缀 → Phase 2 加
glossary 合规软门。这同时是 3 的缓存前缀载体。

### 5. 双日期体系并存

`#375` 造了被 bot/`[skip ci]` 过滤过的 `generated/doc-dates.json`（可信），
`#376` RSS 用的却是 frontmatter `date`（作者手填，很多文档缺失或过时）。
同一站点两种"文档时间"定义。**修正**：RSS 改读 doc-dates.json，缺失才
fallback frontmatter；合并两分支后 30 分钟的活。

### 6. TM 只进不出

translation-memory.json 的条目随源段变化只增不删，长期是只涨不缩的
死数据（且是 merge conflict 面）。**修正**：APPLY 尾部加 GC——凡 source
hash 已不存在于任何现存文档的条目删除；deterministic 序列化已具备，GC
后照样可字节比对。

### 7. OG 图的运行时逃逸面

`opengraph-image.tsx` 跟随 `dynamicParams: true`：未知 slug 的爬虫请求会
触发运行时 satori 渲染 + Google Fonts 外呼——正是 Vercel CPU 红线最忌惮
的"bot 扫描烧函数"形态。**修正**：OG route 对 `generateStaticParams` 外
的 slug 直接返回静态兜底图（或 404），不做运行时渲染。

### 8. 贡献者规则的 squash 盲区

`[translation-sync]` 标记依赖 commit subject 存活；上游若用 squash merge，
subject 可能被改写，标记丢失 → bot 批量翻译被计为人类贡献。mocked-signoffs
里记录了 delete/recreate 边界，但没记录 squash 边界。**修正**：规则加一层
作者兜底（github-actions[bot] 已被排行榜过滤，风险窗只剩"人类操作者手动
跑 APPLY 后自己 commit"——这恰好是应该计分的情形，所以实际风险比看起来
小；在 register 里补记这一条推理即可，代码可不动）。

## P3（观察项，不需要立刻动）

- **related-docs 覆盖率未测量**（#381）：tag 稀疏的语料下可能大量文档
  0 推荐。合并后跑一次统计：有推荐的文档占比 <60% 就把标题 token 重合
  加进评分。
- **7 个 unalignable doc** 是 P1-1 的验收样本，先不手工修。
- **`.claude/worktrees` 泄漏面**：vitest 排除已加（phase0），但 eslint/
  prettier/fast-glob 类工具同样可能扫到 worktree——遇到再加排除，不预修。
- **quality 报告的 en→zh 方向覆盖**：length-ratio 只做了 zh→en，10 个
  en 原文 + .zh 翻译对当前无软门。语料占比 <7%，暂缓。

## 复盘的复盘（过程层面的教训）

1. **规格转写是丢功能的主要通道**：锚点钉扎在计划文档里存在、在我给
   subagent 的任务书里消失。机制修正：给执行 agent 的任务书应附"计划
   条目号清单 + 每条 done/deferred 标注"，让缺项显式化而不是静默化。
2. **门禁标准要区分"构造性保证"与"存量正确性"**（P1-2 的根因），
   这条应进 CLAUDE.md 级约束的候选。
3. **并行 agent + 共享沙盒的资源冲突**（并发 build 全被 SIGTERM）浪费了
   一轮返工；后续同类任务应一开始就规定"验证=typecheck+test，build 由
   汇总方串行做"。
