# 交付后第一性原理复盘（2026-07-19）

> 对本轮交付的 15 个实现分支做批判性复盘：不看"做了什么"，只看"哪里
> 站不住"。每条先给结论，再给证据与修正方向。已与 upstream 最新 main
> （`4cc1055`）比对。

## 新事实：上游已发生两件改变前提的事

1. `a051f04` 双协议——代码 Apache-2.0 + 文档内容 CC BY-NC-SA 4.0。盲点
   分析 §6 按"全仓 CC"写成：**内容侧结论不变**（翻译仍是演绎作品、SA
   传染成立），流水线代码本身落在 Apache 侧反而更干净。只需改表述。
2. `9d49d3d` 修回 33 篇被机翻毁掉的中文 title——**生产侧独立证实了本轮
   质量分析的核心判断**（历史机翻管线确实破坏过内容）。也意味着基于旧
   main 的 TM bootstrap 数字（1513 adopted）在新 main 上会小幅变化。

## P1（真缺陷，合并前后立刻修）

### 1. 锚点钉扎从计划里静默丢失

盲点分析 §7 Phase 1 第 4 条（zh heading 注入 `[#slug]` 显式 id）**没有
出现在任何交付分支**（对 phase3-4 分支 grep `\[#` = 0）。它同时是：
差异化清单里生态全空白的一项；**位置对齐脆弱性的解药**——三方保护当前
按位置对齐 zh/en 段落，7 个 doc 因段数不一致整篇跳过；若段落带显式 id，
人加/删一节不再打散全篇。修正：Phase 1.5——codemod 注入现有 slug 值
（URL 零变化）→ segmentMdx 解析显式 id → 对齐键从位置改 id → 7 个
unalignable doc 作为验收样本。

### 2. fence 字节等同硬门与存量语料冲突，照单执行会把英文文档改差

Phase 2 的 87 个 fence-integrity error 全是旧翻译把**代码注释**翻成英文。
对英文读者这是改善不是缺陷；照报告"清零"= 把英文注释改回中文，负价值。
根因：把新流水线的**构造性保证**（placeholder 使 fence 不可能变）误用作
**存量正确性标准**。修正：fence 门两级——去注释后 token 序列不等 →
error；仅注释差异 → warning 标注 translated-comments。需要按 fence info
string 选注释语法的最小剥离器（`//` `#` `--` `/* */` 覆盖语料 95%）。
在此之前 87 条不应作为待修清单分发。

### 3. 翻译成本模型与研究结论脱节

研究结论：Sonnet 级 + Batches API 五折 + 缓存 glossary 前缀。实际交付：
默认 `claude-opus-4-8`（≈5× Sonnet 单价）、逐条 Messages 调用（grep
batch = 0）、system prompt 未按可缓存前缀设计。当前欠翻量小（183 段）
差额无所谓；全量重翻场景会按 ~10× 必要成本执行。修正：默认改 Sonnet
当前版；≥50 段 APPLY 走 Batches；prompt 改固定前缀+内容后缀结构。

## P2（结构性弱点，下个迭代）

4. **glossary 机制缺失**（grep = 0）：TM 只防重翻，不保证新段落术语与
   旧段一致；WMT25 证据 glossary 注入是因果性提升。从已 adopt 的 TM 挖
   高频术语对生成初版 → 注入 prompt 前缀（兼作 P1-3 的缓存载体）→
   Phase 2 加合规软门。
5. **双日期体系并存**：#375 造了 bot/skip-ci 过滤后的可信
   doc-dates.json，#376 RSS 却读作者手填的 frontmatter date。RSS 改读
   doc-dates，缺失才 fallback。合并后 30 分钟。
6. **TM 只进不出**：源段消失后条目永存，长期是只涨的 merge-conflict 面。
   APPLY 尾部加 GC（source hash 不在任何现存文档 → 删）。
7. **OG 图运行时逃逸面**：`dynamicParams: true` 下未知 slug 的爬虫请求
   触发运行时 satori + Google Fonts 外呼——正是 Vercel CPU 红线最忌惮的
   形态。OG route 对 generateStaticParams 外的 slug 返回静态兜底，不做
   运行时渲染。
8. **贡献规则的 squash 盲区**：`[translation-sync]` 标记依赖 commit
   subject 存活；squash merge 可能改写。实际风险窗小（bot 作者已被排行
   过滤，剩"人工跑 APPLY 自己 commit"恰是应计分情形）——register 补记
   推理即可，代码可不动。

## P3（观察项）

- related-docs 覆盖率未测量：tag 稀疏语料可能大量 0 推荐；合并后统计，
  <60% 就加标题 token 重合项。
- 7 个 unalignable doc 等 P1-1 后重对齐再人工复核，先不手修。
- length-ratio 只覆盖 zh→en；en 原文对（<7%）暂缓。
- `.claude/**` 排除只加了 vitest；其他扫描器遇到再加，不预修。

## 复盘的复盘（过程教训）

1. **规格转写是丢功能的主要通道**：锚点钉扎在计划文档存在、在给
   subagent 的任务书里消失。机制：任务书附计划条目号清单，每条标
   done/deferred，让缺项显式化。
2. **门禁标准要区分"构造性保证"与"存量正确性"**（P1-2 根因）。
3. **并行 agent 共享沙盒的资源冲突**（并发 build 全 SIGTERM）浪费一轮
   返工；同类任务开局就规定"验证=typecheck+test，build 由汇总方串行"。
4. **远端状态验证要走独立信道**——另见同日 incident 文档。
