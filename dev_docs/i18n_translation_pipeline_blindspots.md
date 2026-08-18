# 文档翻译管线盲区研究 & 执行计划（2026-08）

> 本文是对"双语文档翻译管线"的 blindspot pass 产出：9 路并行调查（3 路仓库取证 +
> 6 路外部研究：MT 质量基准、工具生态、Provider 限制与成本、许可法务、SEO 收录
> 风险、质量门与增量架构）的综合。目标读者是**下一个执行工程 agent**——读完本文
> 不需要重新发现问题空间。所有仓库数字均为 2026-08-18 实测（含真实跑通
> fumadocs loader 的探针），外部结论均附来源。
>
> 根目录的 `docs-i18n-design.md` 是 2026-04 的设计稿，**大部分前提已失效**，
> 本文第 7 节逐条列出它的过时点。执行时以本文为准。

---

## 0. 结论速览

调查推翻了任务的默认框架。团队的心智模型（"翻译管线还没建，需要把 150 篇中文
文档翻成英文"）在五个维度上与现实相反：

1. **语料库已经翻译完了。** 2026-04 和 2026-05 两轮 Claude agent 翻译战役已经
   跑过（opus-4-6 + sonnet-4-6，共 159 个文件带 `translatorAgent` frontmatter），
   真正没有英文版的中文文档只有 **1 篇**。管线的任务是**修复、合规、质量门、
   增量保鲜**，不是首翻。
2. **被机翻毁掉的是中文侧，不是英文侧。** 31 个 `_translated.md` 里 25 个的
   正文是英文机翻残渣（"Hiccup" 一类），而它们 docId 配对的 `.en.md` 是流畅的
   sonnet 译文。**干净的中文原文在 git 历史里不存在**：这批文件是 longsizhuo
   2025-11~12 逐日单独 commit 的（"chore: add daily leetcode post
   NNN_translated"），**进 repo 时就已经是污染态**——中文正文只能从英文版
   回译或找作者要原稿。
3. **英文搜索索引从上线起就是空的。** fumadocs-mdx 的默认 frontmatter schema
   会剥掉所有自定义字段（`lang`/`docId`/`translatedFrom` 运行时全是
   undefined），叠加 `source.getPages()` 不传 locale 默认取中文表——en 分片
   恒为 0 条。翻译做得再多，搜索收益为零，直到修掉这两个 bug。
4. **合规欠账是现在进行时。** 159 个机翻页面自 2026-04/05 上线起对读者零
   披露，而中国《人工智能生成合成内容标识办法》在上线**之前**（2025-09-01）
   就已生效、要求公开传播的 AI 生成文本显式标识——对本站受众这是实际约束的
   法域。CC BY-NC-SA 4.0 第 3(a)(1)(B) 条要求"标明修改"是**许可条件**不是
   礼貌。修复只需一个读 frontmatter 的组件。
5. **成本不是问题，从来不是。** 全语料一遍 frontier 级翻译 ≈ $3-5（Sonnet 5），
   DeepSeek V4-Flash 谷时 ≈ $0.25。"限时免费 Claude Token"约束应重新表述为
   "$25 封顶的 API key"。真正的成本在验证与人的注意力。

**14 个文档目前在站点上不可见**（dot parser 把 `213.打家劫舍II_translated.md`
的 `.打家劫舍II_translated` 当成 locale 后缀，文件被丢弃）——没有人发现过。

---

## 1. 语料库地面真相（以此为准，作废一切旧口径）

### 1.1 文件层（304 个 md/mdx，1.51 MB）

| 类别 | 数量 | 说明 |
| --- | --- | --- |
| 裸名 base 文件（默认 zh） | 111 | 其中 8 个是 en→zh 翻译产物（2 篇 papers + 6 篇 data-structures，英文版才是原文），3 个正文实际是英文 |
| `*.en.md(x)` | 152 | 144 个是 zh→en 机翻（带 `translatedFrom`），8 个是英文原创 |
| `*_translated.md` | 31 | longsizhuo 2025-11~12 的每日 LeetCode 帖，**进仓库前就已被上游机翻污染**；25/31 正文以英文残渣为主 |
| `*.zh.md` | 10 | 全在 leetcode/，`5410caa` 去重时产生；其中 7 个也是 en→zh 翻译产物；与 dev_docs "禁止 .zh 后缀"的教条并存但不报错（因为没有同 stem 裸名文件冲突） |

en→zh 产物合计 15 个（8 裸名 + 7 `.zh.md`）——设计稿"双向 zh⇄en"的决定
已被语料验证。

**frontmatter 字段清单（Phase 0.1 schema 扩展的依据，304 文件实测）**：
`title` ×304、`description` ×304、`docId` ×303、`date` ×276（**≥10 种格式并存**：
`"YYYY-MM-DD"` ×179、`"YYYY.MM.DD H:MM"` ×60、未加引号的 ISO-8601 ×10、
`DD/M/YYYY` ×6…）、`tags` ×262、`abbrlink` ×87（hexo 前身残留）、
`lang`/`translatedFrom`/`translatedAt`/`translatorAgent` ×159、`status` ×6、
`category` ×4 与 `categories` ×2（键名不一致）。另有 8 个 `.en` 文件缺
`lang: en`（即 8 个英文原创）。未加引号的日期 + 混乱格式 = 任何 YAML
parse→stringify 往返都会产生大面积不可 review 的 diff（见 Phase 2 的
surgical writer 硬约束）。

**残渣 `.en` 文件清单（Phase 1.3 的工作对象，10 个）**：code fence 外含 CJK 的
8 个——`career/interview-prep/leetcode/42-trapping-rain-water.en.md`（97 个
CJK 字符，第 36 行是整段未翻中文）、`learn/cs/data-structures/array/02-dynamic-array.en.mdx`
（214 个，主要是代码块内中文注释）、`coffee-chat.en.md`（4）、`math_books.en.md`
（69）、`01-singly-linked-list.en.mdx`（26）、`picturecdn.en.mdx`（2）、
`preparations-for-studying-abroad.en.mdx`（3）、`learning-toolkit.en.mdx`（4）；
另有 5 个 code 外含全角标点（与上述部分重叠，最多 10 字符）。

配对完整性：**110 对同 stem base+.en 配对，110/110 docId 一致，0 错配**；
10 对 `.zh.md`+`.en.md` 同样 docId 一致。31 个 `_translated.md` 与 31 个
**不同文件名**的 `.en.md` 通过 docId 配对（如 `[213]打家劫舍 II_translated.md`
↔ `213-house-robber-ii.en.md`）。**docId 配对全语料 100% 完好；slug 配对在
31 个题目上是断的。** 另有 3 组重复 slug 家族共用一个 docId（counting-stars
四胞胎、9021-tut 四胞胎、2894 三胞胎）和 3 对字节相同的假翻译对
（`mllm/index`、`vit/index`、`Counting Stars…`——两侧都是英文）。

唯一完全没有英文版的文件：`content/docs/learn/cs/leetcode-solution-manager.md`
（也是唯一缺 `docId` 的文件）。

### 1.2 运行时层（真实跑通仓库 loader 配置的探针结果）

| 指标 | 值 | 含义 |
| --- | --- | --- |
| `getPages("zh")` | 138 | 中文页面总数 |
| `getPages("en")` | 171 | = 138 继承 + 33 个 en-only 孤儿 |
| SSG 页面（locale×slug） | 309 | `page.tsx:227` 注释写的 "~636" 是错的 |
| `/en` URL 实际渲染中文正文的 slug | **19** | fallback 陷阱的真实规模（不是旧口径的 68） |
| **两个 locale 都不可见的文件** | **14** | 13 个 stem 含 `.` 的 `_translated.md` + `2894. 分类求和并作差.md`，被 dot parser 当成未知 locale 丢弃 |

19 个 fallback slug 的构成：18 个可见 `_translated.md`（它们的英文版在别的
slug 下）+ 1 个真·未翻译文件。恰好对账。

### 1.3 数字口径对照表（防止后续 agent 再被旧数字带偏）

| 旧口径 | 出处 | 实际 |
| --- | --- | --- |
| "150 篇文档、英文内容几乎为零" | `docs-i18n-design.md` | 304 文件、152 个 .en，翻译已基本完成 |
| "318 篇 docs" | `dev_docs/i18n_url_routing.md` | 当时含即将清理的重复；现 304 |
| "68 篇 zh-only 无英文版" | 本轮初测（shell 粗扫） | 错：把 10 个 `.zh.md` 和 docId 配对都算漏了；真值 1 篇 |
| "46-48 个孤儿 .en" | 本轮初测 | 文件层孤儿 42（31 配 `_translated` + 10 配 `.zh.md` + 1），运行时 en-only 33 |
| "~636 SSG 页" | `page.tsx:227` 注释 | 309 |
| "31 个 _translated 是中文正文" | PR #396 语境 | 25/31 是英文机翻残渣正文 |

---

## 2. 已上线的 bug 清单（翻译管线开工前必须知道，多数必须先修）

按影响排序，均已复核证据。

| # | Bug | 证据 | 影响 |
| --- | --- | --- | --- |
| B1 | **fumadocs 默认 schema 剥掉所有自定义 frontmatter**。`defineDocs({dir})` 未传 schema，运行时 `page.data` 只剩 `{title, description, icon, full, _openapi}` | `source.config.ts:19-21`；fumadocs-mdx `dist/chunk-GBMFGEC7.js:11-17`；探针实证 | `lang`/`docId`/`translatedFrom`/`date`/`draft` 在 app 层全是 undefined：en 搜索过滤失效、Giscus 拿到 `docId: null`、draft 过滤失效、sitemap 日期回退 |
| B2 | **英文搜索分片恒为空**（双重 bug：`source.getPages()` 无 locale 参数默认取 zh 表；`isEnglishPage` 读被 B1 剥掉的 `lang`） | `app/search.en.json/route.ts:13`、`lib/search-index.ts:44-47` | 152 个英文页面在任何搜索里都不存在；`/en` 用户搜索永远零结果 |
| B3 | **14 个文件对整个站点不可见**（stem 含 `.` 被 dot parser 当 locale 丢弃） | 探针 + `ls` 复核（13 个 `_translated` + 1） | 含 PR #396 刚修完标题的文件；sitemap/搜索/llms.txt 都列不到它们 |
| B4 | **fallback 页面在元数据层撒谎**：19 个 `/en` URL 渲染中文正文，却输出自指 canonical、`hreflang=en-US`、JSON-LD `inLanguage: en-US`，且全部进 sitemap 和 llms.txt | `app/[locale]/docs/[...slug]/page.tsx:147,252-268`、`app/sitemap.ts:76-88` | Google 被告知"本站有完整英文版"；33 个 en 孤儿的 sitemap alternates 还指向 404 的 zh URL（hreflang 互指失败 → 整条被忽略） |
| B5 | **hreflang 双源分裂**：head 有 `x-default`，sitemap 没有 | `page.tsx:265` vs `sitemap.ts:137-140` | 两个声明源不一致是 Google 文档明确警告的冲突模式 |
| B6 | **docId 配对地雷**：`uuid.mjs` 给任何缺 docId 的文件盖全新随机 cuid2，无配对意识；sync-uuid.yml 跳过 bot push，所以污染发生在**之后某次无关的人类 push** 上 | `scripts/uuid.mjs:58-84`、`sync-uuid.yml:44` | 管线生成 `.en` 忘复制 docId → 配对永久分叉，且延迟爆炸极难排查 |
| B7 | **`pnpm docs:sync-cuid` 本地是坏的**：`DOCS_DIR` 默认 `"../content/docs"`（父目录相对路径），从仓库根跑扫到 0 个文件静默 no-op | `scripts/uuid.mjs:22` | 贡献者无法自助补 docId；只在服务器上碰巧能跑（.env 覆盖） |
| B8 | **仓库唯一的 LLM 脚本先例大概率已死**：据二级来源，`deepseek-chat` 模型 ID 2026-07-24 起退役（现役 `deepseek-v4-flash/pro`，2026-08-16 起分峰谷计价）——**动手前对 api-docs.deepseek.com 二次确认** | `scripts/generate-descriptions.mjs:61`（默认 ID 实证；退役本身为二级来源推断） | 照抄该脚本的管线可能继承 400 错误；2026 年还杀死了 Qwen 免费层（4 月）、Gemini **Pro** 免费层（4 月）、DeepL API Free 新购（7 月）——2025 年记忆里的免费层大多没了 |
| B9 | **派生产物仍带机翻残渣**："213.Hiccup II" 还活在 `generated/site-leaderboard.json:546`——PR #396 修了源文件没重新生成派生 JSON | 实测 grep | 标题修复没有闭环；排行榜对外展示垃圾标题 |
| B10 | **deploy.yml 的 IndexNow slug 查询双重失效**：`jq '.[$k]'` 查的是旧扁平结构，slug-map 已是 `{byName,byNumber}` 嵌套；且 map 的**值也变了形状**——现在是带 locale 前缀的完整路径（`"/en/docs/career/…"`），而 deploy.yml 拿到值后还会再拼 `$SITE_ORIGIN/{zh,en}/docs/` 前缀，naive 改成 `.byName[$k]` 会产出双重前缀垃圾 URL | `deploy.yml:111` + `generated/leetcode-slug-map.json` 值形状实测 | 中文 stem 的 URL 未经拼音化就提交给 IndexNow；修复需同时适配结构与值形状（值已是完整路径时直接用，不再拼前缀） |
| B11 | **设置页语言选项不换语言**：还在用 cookie+refresh 旧机制，URL 段化路由下 URL 优先 | `app/[locale]/settings/SettingsForm.tsx:269-273`（对比正确实现 `app/components/LocaleToggle.tsx:28-30`） | 交付了一个不工作的承诺；header 的 LocaleToggle 是好的 |
| B12 | **CI 从不编译 MDX、从不 `next build`** | `deploy.yml:58-60`（仅 lint/typecheck）、content-check.yml | 语法坏掉的 `.en.mdx` 全绿通过、在 Vercel 上才炸；CLAUDE.md §2 的 build 表验证纪律没有 CI 兜底 |
| B13 | **prebuild 会原地改写内容文件**：`escape-angles.mjs` 每次 build 重写 `content/docs/**/*.md` 的可疑 `<...>`；服务器端 backfill 遇到脏树拒跑 | `scripts/escape-angles.mjs:24,44-75`、`sync-uuid.yml:83-87` | 管线生成 `.md` 后必须自己跑一遍 prebuild 并提交被改写的结果，否则埋一颗延迟脏树炸弹 |

另有一个攻击面级别的事实：`46-permutations.zh.md` 完整复制了 leetcode.cn 的
题面（第 17-36 行）且本身就是机翻产物——**站点已经机翻过一次 LeetCode 拥有
版权的文本**。leetcode/ 目录下含题面标记（示例/输入：/Example + Input:）的
只有 6 个文件（3 对）——风险面比"91 篇 LeetCode 文档"的直觉小一个量级，但这
6 个必须处理（见 §5.1.4）。（注：同样的标记正则在全语料能匹到 ~26 个文件，
其余是普通技术文档里正常使用"示例"一词，不是题面复制。）

---

## 3. 外部研究：六个领域的关键结论

### 3.1 MT 质量与基准的误导性

- **前沿模型之间的差距已小于噪声**：zh⇄en 人评（Hunyuan-MT 报告）Gemini-2.5-Pro
  3.223 / DeepSeek-V3 3.219 / Hunyuan-MT-7B 3.189，差距 <0.034。**模型选型不是
  质量瓶颈，管线设计才是。** WMT24 结论标题就叫 "The LLM Era Is Here but MT Is
  Not Solved Yet"；WMT25 上 Gemini 2.5 Pro 拿下 14/15 语向最优簇。
- **没有任何基准测量本仓库真正会挂的东西**：markdown/MDX 结构保真、跨 300 文件
  术语一致性、标题短串翻译。COMET 系列对数字与命名实体错误明确不敏感
  （Amrhein & Sennrich 2022；xCOMET 论文自认）；top 系统之间 metric 与人评
  相关性坍塌甚至转负（WMT24 Metrics Task）。**BLEU/COMET 分数在这里只会制造
  虚假信心，直接跳过。**
- **"Hiccup" 事故是上下文饥饿类失败**（短标题脱离正文单独翻译），SemEval-2025
  Task 2 整个任务就是为命名实体翻译失败而建。修法是机制性的：标题必须与正文
  同 prompt 翻译；LeetCode 题目有官方英文名，**查表、永不生成**（仓库已有
  `generated/leetcode-slug-map.json` 基建）。
- **方向不对称**：en→zh 系统性弱于 zh→en（LingualX64 基准 DeepSeek-V3 差 34.8
  分；Hunyuan 自评亦同向）。本仓库接下来最大的一笔翻译恰恰是 en→zh 回译
  （§5.1.2）——弱方向 + 主受众语言，**这批必须过人工 review，不能裸发**。
- **词表决定被 2025 证据推翻**：WMT25 Terminology Task 结论"术语表对好系统尤其
  有用"；SemEval-2025 实测 prompt-only 实体引导是最弱干预。设计稿正文自己预言
  了术语冲突（`docs-i18n-design.md:291`）然后附录反悔——正文是对的。中文 CS
  术语还分领域（鲁棒性/稳健性/健壮性），"CS+AI 领域约束"一句 system prompt
  钉不住。**建 50-200 条的 JSON 词表**，prompt caching 下成本是几美分。
- **中文排版永远不进翻译 prompt**：LLM 会把盘古之白加进文件路径和 shell 命令里
  （qwen-code#2390 实锤）。排版规范化（全角标点、CJK-Latin 空格）属于结构感知
  的 linter（autocorrect/zhlint 思路，排除 code span），不属于模型。

### 3.2 工具生态：买 / 抄 / 建

- **最接近的现成品**：`pelikhan/action-continuous-translation`（MIT，GenAIScript，
  2025-26 活跃）。已实现：mdast 逐节点 SHA-256 hash 缓存（只重译变更节点）、
  frontmatter 字段白名单、MDX JSX title 属性处理、parse 往返 + LLM judge 验证、
  **默认输出文件名就是 fumadocs 的 dot 后缀格式**（`foo.en.md`）。值得花一天
  spike 本地跑（不用 Action 形态，遵守"手动触发"决定）；若 MDX 保真/DeepSeek
  兼容/缓存格式三项有两项不合适，就把它一个文件的核心逻辑 fork 进
  `scripts/translate-docs.mts`——那叫抄，不叫重建。
- **必抄的三个模式**：(a) Microsoft co-op-translator 的文件内 hash 注释
  （`original_hash` + `source_file` + 免责声明，GitHub 上 41k+ 文件在用）——
  一个机制同时解决过期检测、机翻/人翻溯源、CC 披露；(b) 逐节点 TM（lingo.dev
  的 i18n.lock 同理：10,000 键改 12 个只翻 12 个）；(c) gettext `msgmerge`
  的**三态语义**：up-to-date / fuzzy-needs-review / untranslated，**永不静默
  覆盖人工校对过的段落**。
- **不要用 SaaS/TMS**：Crowdin 开源免费额度以"贡献你的翻译进他们的全局 TM"为
  条件（CC BY-NC-SA 内容进商业 TM 是没清过的许可问题）；per-string 工作流与
  dot 后缀文件模型八字不合；"手动触发"决定也用不上它们的持续同步价值。
- **设计稿的 mtime 过期检测是坏的，不是次优**：git 不保存 mtime，CI fresh
  checkout 后所有文件 mtime 是 clone 时间。`[translation-fix]` commit 前缀在
  squash merge 下必死。**内容 hash 是唯一在本仓库工作流（多文件 PR、squash）
  下正确的过期模型。**
- **真正有差异化价值、市面上没有的东西只有一小块**：(a) 懂 `fallbackLanguage`
  不对称性的过期模型——**过期的英文比没有英文更糟**（缺失回退到最新中文，过期
  则展示旧英文），"删除这个过期翻译"应是合法动作，Lunaria 都表达不了；
  (b) 与 `next build` 路由表 diff（CLAUDE.md §2）联动的回归门。其余全部应该
  采用或抄袭。

### 3.3 Provider 现状与成本（2026-08）

- 实测语料：zh 侧 745 KB（137K 汉字 + 330K ASCII）。中文 token 化按 ~1.0-1.5
  汉字/token 规划（"2 字/token"对西方 tokenizer 过于乐观）。全量一遍 ≈ 0.25M
  in / 0.25M out。
- 成本表：DeepSeek V4-Flash 谷时 **~$0.25**；Haiku 4.5 ~$1.5；Sonnet 5 ~$4.5
  （2026-08-31 前 intro 价 ~$3）；Opus 5 翻译 + Sonnet QE ~$10-12。月增量
  （10 篇）都在 $1 以下。**预算讨论到此为止。**
- 输出上限：最大文件 46.7 KB ≈ 18-20K 输出 token，Claude/GPT 128K、Gemini 64K、
  DeepSeek V4 384K 都放得下——但**必须逐调用检查 `finish_reason`**（老
  deepseek-chat 的 8K 上限会静默截断，这类坑还会再出现）。
- Claude 已**移除 assistant prefill**（4.6+/5 全系 400）——任何靠 prefill 强制
  输出格式的设计作废；用 structured outputs 翻译"文本节点数组"。Prompt caching
  最小前缀 1024 token——短 system prompt 根本不缓存，**system prompt + 词表**
  正好过线且 149/150 次调用付 0.1×。
- Batch API 不适合"贡献者笔记本手动跑"模型（24h 轮询换 $1-2），顺序调用 +
  逐文件原子写 + 失败跳过重跑（`generate-descriptions.mjs` 已验证的形状）即可；
  Anthropic Tier-1 限额（~500K in / 80K out TPM）对顺序跑绰绰有余。
- ToS：Anthropic/OpenAI/Google/DeepSeek 都把输出权利转给用户，发布为
  CC BY-NC-SA 无冲突、无署名附带条件。**避开 DeepL**（对提交内容自留永久
  可再许可的使用权 + 至今没有 markdown 模式）。DeepSeek 记得关掉数据改进选项。
- 免费层大面积消失（见 B8）；幸存的两个也不该用：Gemini **Flash** 免费层还在
  但拿你的数据训练；Google Cloud Translation 的永久 500K 字/月免费层理论上
  覆盖全语料（~467K 字）但没有 markdown 模式、占位符管线照建不误。**不要在
  任何免费层上建管线**，$25 硬上限的付费 key 是"有限预算"的正确实现。

### 3.4 许可与法务

- **CC BY-NC-SA 4.0 下翻译 = Adapted Material**，站点是自己贡献者的被许可人，
  每个翻译页欠四样东西：作者署名 + 指回原文的链接 + **"已修改/系机器翻译"的
  标注（3(a)(1)(B)，许可条件）** + BY-NC-SA 传染声明（3(b)）。渲染一个 footer
  组件即可满足（3(a)(2) 允许"任何合理方式"）。
- **纯机翻输出无独立版权**（USCO 2025 报告；Thaler v. Perlmutter 案 SCOTUS
  2026-02 拒绝调卷——训练截止后信息，按报道处理）。因此**不要在机翻页盖
  "© InvolutionHell"**——标注应呈现为原作许可的透传，不是站点的新版权主张。
- **道德权利未被许可**：CC 明文不许可 integrity 权；中国著作权法的保护作品
  完整权不可转让不可放弃。烂机翻挂在作者名下是有理论基础的侵权主张。缓解：
  显著的机翻标注 + `noTranslate: true` 退出机制 + 应请求下架。
- **实际管辖的是中国标识办法，不是 EU AI Act**：《人工智能生成合成内容标识
  办法》2025-09-01 生效，要求显式标识 + 元数据隐式标识，出版方有主动申报义务，
  受众就是中国用户。EU AI Act Art. 50（2026-08-02 起可执行）对"公共利益信息"
  的适用性对本站边缘，且有人工编辑责任豁免。**合规动作相同：可见标注 + meta/
  JSON-LD 溯源字段，一次修复同时满足 CC、中国办法、道德权利缓解三件事。**
- **LeetCode 风险面**：ToS 明确禁止复制题面，但社区复制无处不在、无 DMCA
  campaign 记录（github/dmca 检索）——执法风险低，违约性质无争议。N=6 文件，
  处理成本极低：删题面留链接。用 leetcode.cn 官方中文标题当词表锚点不构成
  侵权（短语/事实不受版权保护）。
- 行业规范：Kubernetes 明文禁止发布未经人工 review 的机翻；MDN 把机翻 locale
  隔离为 experimental。**"机翻直接可见 + 明确标注 + 分级 index"是本站介于
  两者之间的合理位置。**

### 3.5 SEO 与收录风险

- **Google 2024-03 "scaled content abuse" 政策点名"自动化翻译"为例子**，但
  2025-06-11 官方软化：删除了"用 robots.txt 屏蔽自动翻译页"的老建议，改为
  **对低质量翻译逐页 `noindex`**；"提供价值、连贯、满足意图"的 MT 不再自动
  成问题。Reddit 数百万 AI 翻译页在排名（Glenn Gabe 追踪）——但那是 Reddit 的
  信任缓冲，小站没有。
- **最大的下行风险不是英文流量拿不到，而是中文语料的既有排名**：站点级质量
  分类器（helpful content 并入 core updates）会因低质量板块压制全域。abort
  判据必须盯 zh 指标（见 §5.4）。
- **fallback 陷阱是现在进行时**（B4）。Google 对"本地化 URL 提供源语言内容"
  的处理是当重复折叠（Mueller："should just ignore"），所以这 19 个 en URL
  在收录报告里的沉默**掩盖着问题**——上线 MT 后同样的沉默将无法与"MT 被判
  低质"区分。**先修 fallback 元数据，再拿 GSC 基线，再上新页面**，顺序不能反。
  业界先例：GitLab 对 fallback 页把 canonical 改写指向英文原版；MDN 直接归档；
  Kubernetes 无同 URL fallback（未翻译 = 该 locale 无此页）。
- **hreflang**：`zh-Hans`（按文字，不锁地区）比 `zh-CN` 更贴合"海外中国 CS
  学生"受众；head 与 sitemap 双源必须统一（或删 sitemap alternates 只留 head）；
  GSC 2022 年就删了 International Targeting 报告，**hreflang 坏了没有任何现有
  工具会告警**，需要第三方验证器。百度不支持 hreflang 且本站无 ICP 备案——
  百度是非参与者，不为它做任何设计。
- **爬虫经济学**：~700 URL 量级远低于 Google crawl budget 阈值，收录侧不是
  问题；风险在 Vercel 账单侧——5/11 事故 = 4 次 deploy + IndexNow ping 引发
  重抓风暴（CPU 198%、Fast Origin Transfer 120%）。一次性 150 文件 PR 会是
  放大重演。**分批 ≤25-30 页/次、间隔数天、只对正文真实变更设 lastmod**。

### 3.6 质量门与评估

- **神经 QE 的坑在许可不在能力**：CometKiwi/xCOMET 全系 CC-BY-NC-SA（gated）；
  **MetricX-24 是干净的 Apache-2.0 替代**，但只有 Python/PyTorch——JS 单仓跑
  不了神经 QE，可选做成 nightly Python Action，**不要让管线阻塞在 Python 基建上**。
- **LLM-as-judge 可用但有实测偏差**：self-preference 由困惑度驱动（judge 高估
  "眼熟"文本）；**judge 模型族 ≠ 翻译模型族**。GEMBA-MQM 的 3-shot MQM 错误
  span 标注 prompt 可直接复用，MQM 权重给出数值门槛（任一 critical 即 fail）。
  只 judge 确定性检查器标记的段落 + 每批 10% 抽样，不跑全量。
- **最便宜的检查抓住了实际发生过的全部事故**："Hiccup II" 过不了词表查表；
  "…too difficult，So find…" 过不了一行正则（英文输出含全角标点
  `[，。；：！？]`）。**确定性验证器优先建，零 LLM 成本**：
  mdast 结构同构（节点类型序列一致、code 块字节相同、链接/图片目标相同、
  JSX 组件名与非文本属性相同）、数字与 inline-code 多重集一致、KaTeX 可解析、
  en 输出无 CJK 标点、长度比界（en/zh 字符比典型 1.5-3×）、frontmatter schema
  （docId 字节不变）、**标题锚点重对齐**（翻译改变 heading → GitHub slug 变 →
  文内 `#锚点` 断链；co-op-translator 在生产中撞过并专门修过，本仓库 TOC 同构）。
- **人工环节学 Kubernetes 2026-06 的立场**："AI 辅助应支持人工 review，而非
  制造新的未验证内容流"——产出**确定性 triage 报告**（PR 评论形态），把志愿者
  注意力只导向被标记的最差段落；不建审批官僚。Vue 翻译组 2026 明言 AI 翻译质量
  已改变维护独立官方翻译的成本收益——方向是对的，缺的是门。

---

## 4. 盲区总表（本次 pass 的核心产出）

1. **任务框架反了**：不是"建管线做首翻"，是"修复已发生的翻译 + 给未来变更
   建增量保鲜与质量门"。首翻 backlog = 1 个文件。
2. **中文原文永久丢失**（31 篇日更帖导入前即污染）。唯一非 MT 恢复路径：这批
   全是 longsizhuo（Siz Long，维护者本人）的每日帖，**先去他的上游个人仓库/
   博客找原稿**（87 个 `abbrlink` 字段指向一个 hexo 前身），找不到再 en→zh 回译。
3. **frontmatter 契约是虚构的**（B1）：PR #396、设计稿、类型定义、代码注释都
   假设 `lang`/`translatedFrom` 运行时可见——全被 schema 剥掉。所有下游功能
   （搜索过滤、翻译标注、fallback 检测）都建立在这个虚构之上。
4. **en 搜索空转 3 个月无人发现**（B2）——因为没有任何断言两个分片非空的测试。
5. **14 个不可见文件**（B3）——"文件在仓库里"≠"页面存在"。
6. **合规欠账在生产环境活着**（§3.4）：159 个机翻页自 2026-04/05 上线起零
   披露，而中国标识办法在上线前就已生效，CC 3(a)(1)(B) 与标识办法双双未
   满足；修复数据早就躺在 frontmatter 里，缺一个组件。
7. **过期不可判定**：`translatedAt` 是裸日期，不记源版本 hash——两轮翻译战役
   留下的最大技术债，"哪些翻译过期了"今天无法回答。
8. **词表决定建立在已消失的前提上**（成本论），且被 WMT25/SemEval-2025 证据
   直接反驳。
9. **fallback 不对称性**：过期英文 < 没有英文 < 新鲜英文；"删除过期翻译"必须
   是管线的合法输出动作——没有任何现成工具能表达这一点（真差异化点之一）。
10. **贡献者激励反噬**：`translatedFrom` 跳过规则（对 bot 正确）同时抹掉**人工
    校对翻译**的贡献——CONTRIBUTING 邀请翻译贡献、统计系统对其记零分，没有
    任何设计文档承认这对矛盾。
11. **SEO 下行风险主要落在中文侧排名**（站点级分类器），而所有讨论都在算英文
    侧收益。
12. **浅克隆考古陷阱**：默认工作克隆是 4-graft 浅克隆，152 个 `.en` 文件全部
    显示为 github-actions[bot] 一个 commit 创建——任何做归因/考古的 agent 必须
    先 `git fetch --unshallow`。

---

## 5. 执行计划

原则：**每个 Phase 独立可交付、可验收**；Phase 0/1 不依赖任何翻译代码；严格
遵守 CLAUDE.md §2（build 表 diff 验证）与 §5（leetcode 改名必须重建 slug map）。

### Phase 0 — 运行时元数据层修复（全是已上线 bug，1 个 PR 或拆 2 个）

| # | 动作 | 触点 | 验收标准 |
| --- | --- | --- | --- |
| 0.1 | 扩展 frontmatter schema：`defineDocs({dir, docs: {schema: frontmatterSchema.extend({lang, translatedFrom, translatedAt, translatorAgent, docId, date, tags, abbrlink, status, draft, hidden, …})}})` ——字段全集与频次见 §1.1 的 frontmatter 清单 | `source.config.ts` | vitest：loader 探针断言 `page.data.docId`/`lang` 非空 |
| 0.2 | 修 en 搜索分片：`source.getPages("en")` + 用**路径后缀**判英文（`/\.en\.(md|mdx)$/.test(page.path)`，对 schema 免疫），zh 分片对称排除 | `app/search.en.json/route.ts`、`lib/search-index.ts` | vitest 用 loader 探针**动态**断言：两分片非空、en 分片条数 == 可见 `.en` 文件数、zh 分片条数 == `getPages("zh")` 数（**不写死常数**——Phase 1.1 修复 14 个不可见文件后页数会变） |
| 0.3 | 新建 `TranslationNotice` 服务端组件：`translatedFrom` 存在时渲染"本页由 AI 从{源语言}原文机器翻译，未经全面人工校对 · [阅读原文] · 原作 CC BY-NC-SA 4.0"；同时向 JSON-LD/meta 写入 AI 生成溯源（中国办法的隐式标识） | 新组件 + `page.tsx`、可复用 `LicenseNotice.tsx` 布局 | 159 个存量机翻页全部出现标注；纯静态（不碰动态 API，保 SSG） |
| 0.4 | fallback SEO 政策落地：用路径判据（`page.path` 不含 `.en.` 且 locale==='en'）识别 fallback → canonical 指向 `/zh` 版 + 不进 sitemap + 不进 llms.txt（GitLab 模式）；同时修 33 个 en 孤儿的 alternates 指向 404 问题 | `page.tsx generateMetadata`、`sitemap.ts`、`llms.txt/route.ts` | 抓取 fallback URL 验证 canonical→zh；sitemap 中无 fallback 条目 |
| 0.5 | hreflang 统一：决策 `zh-Hans`/`en`（推荐）或维持 `zh-CN`/`en-US`，head 与 sitemap 二选一或字节一致（含 x-default） | `page.tsx:259-268`、`sitemap.ts:137-140` | 第三方 hreflang 验证器全绿 |
| 0.6 | docId 机械化：`uuid.mjs` 修 `DOCS_DIR` 默认值 bug；补规则"`foo.en.mdx` 缺 docId 时复制 `foo.mdx` 的，而非生成新的"；**写盘改用 surgical 行级写入器**（`uuid.mjs:79` 现在用 `matter.stringify`，正是 Phase 2 严禁的 YAML 往返，会重写 10 个未引号日期）；先跑修好的脚本给 `leetcode-solution-manager.md` 补 docId，**然后**才在 content-check.yml 开断言：locale 对 docId 一致、全库无缺 docId、`.en` 文件必须带 `lang: en` | `scripts/uuid.mjs`、`.github/workflows/content-check.yml` | 主分支 CI 绿；故意提交一个缺 docId 的 .en 文件，CI 红 |
| 0.7 | 杂修：`generate-descriptions.mjs` 模型 ID → `deepseek-v4-flash`（env 可覆盖，先按 B8 确认现役 ID）；重新生成 `site-leaderboard.json` 灭掉 Hiccup——**注意 `generate-leaderboard.mts` 从 `api.involutionhell.com` 拉数据、后端不可达时故意保留旧 JSON**（这正是它躲过每次 prebuild 的原因），必须在能访问后端的环境跑；修 deploy.yml 的 jq 查询（见 B10，结构+值形状都要适配）；设置页语言选项改用 `router.replace(pathname, {locale})` 或删除 | 各触点见 §2 | 在后端可达环境重跑后 grep 无 "Hiccup"；deploy dry-run 输出拼音化且无双重前缀的 URL |

### Phase 1 — 语料修复（先修数据，再建管线；依赖 0.1/0.6）

1. **slug 统一 PR**（阻塞后续一切）：31 个 `_translated` 家族 + counting-stars/
   9021/2894 三组重复家族，统一为"英文 slug stem：`<stem>.md`（zh 正文）+
   `<stem>.en.md`"；docId 不动；14 个不可见文件在此一并获得合法文件名；
   删除 10 个 `.zh.md`（换成裸名）或明文档化该例外。**流程硬约束**：
   `check-doc-paths.mjs` 会强制在 `next.config.mjs` 补 301；`pnpm build` 重建
   `generated/leetcode-slug-map.json` 并提交（CLAUDE.md §5）；build 前后路由表
   diff 留档（CLAUDE.md §2）。验收：探针显示 0 个不可见文件、en/zh 页面数对账。
2. **重建 31 篇中文正文**：先联系 Siz Long 找上游原稿（abbrlink→hexo）；
   拿不到的用其干净 `.en` 版 en→zh 回译（~80K token，这是弱方向 + 主受众语言，
   **本批强制人工 review 后合并**），frontmatter 记
   `lang: zh / translatedFrom: en / translatedAt / translatorAgent / sourceHash`。
3. **清理 10 个残渣 `.en` 文件**（文件清单见 §1.1"残渣 `.en` 文件清单"）+
   3 对字节相同假翻译对 + 翻译唯一的 zh-only 文件。
4. **LeetCode 题面切除**（N=6）：删除复制的题面正文，保留题号 + 官方标题 +
   指向 leetcode.com/leetcode.cn 的链接。顺手把这 6 页暂时从 llms.txt 排除的
   逻辑并入 0.4。

### Phase 2 — 管线建设（`scripts/translate-docs.mts` + `scripts/verify-translations.mjs`）

先做一天的 **adopt-spike**：本地跑 `pelikhan/action-continuous-translation`
（GenAIScript CLI 形态）对 5 个真实 fumadocs 页面测三件事：MDX/JSX 保真、
OpenAI-compatible endpoint（DeepSeek）可用性、`translations/<lang>.json` 缓存
可否接受入库。≥2 项不合适 → fork 其 `translator.genai.mts` 逻辑进仓库自建。
无论 adopt 还是 build，规格如下：

- **架构**：沿用 `generate-descriptions.mjs` 底盘（dry-run 报告 JSON → 人审 →
  `--apply` → `--from-report` 免重调 → `--limit=N` 抽样；surgical 行级
  frontmatter 写入器——**严禁 gray-matter/js-yaml 往返重写**，10 个未加引号的
  ISO 日期和 60 个 `"YYYY.MM.DD"` 会被静默改写，diff 不可 review）。
- **配对键 = docId，文件名视为派生**；生成 `.en` 时复制 docId（0.6 已机械化）。
- **AST-aware**：remark 解析，只翻 text 节点；code/inlineCode/math/JSX 属性名
  原样；代码注释翻译策略显式可配（默认翻，因为 F5 显示不翻的结果是英文页里
  留着中文注释）；标题与正文同 prompt；leetcode 标题查
  `generated/leetcode-slug-map.json`，**永不生成**。
- **逐节点 TM**：committed JSON（`generated/translation-memory.json` 或
  per-file hash 注释，学 co-op），键 = 源节点规范化 hash；三态语义：源未变→
  跳过；源变 & 现译文==上次机器输出→重译；源变 & 人改过译文→**标 fuzzy 进
  triage 报告，不覆盖**。frontmatter 记 `sourceHash`（整文正文 sha256）替代
  裸 `translatedAt` 做文件级过期判断。
- **词表**：`scripts/translation-glossary.json`（~50-200 条 CS/AI 术语，扫描
  语料高频词起步），注入 system prompt（>1024 token 恰好触发 prompt cache）。
- **Provider**：`TRANSLATE_MODEL`/`TRANSLATE_BASE_URL` env 化（2026 年证明模型
  ID 命不长）。默认推荐 Sonnet 5（结构化输出 + 128K 输出 + ToS 干净），
  低成本档 deepseek-v4-flash（谷时）。顺序调用、逐调用查 `finish_reason`、
  失败不写盘留待重跑。**不用 Batch API，不用任何免费层。**
- **确定性验证器**（独立脚本，也进 CI）：§3.6 的全部检查——mdast 同构、code
  块字节等同、链接/图片/JSX 名与属性等同、数字多重集、KaTeX 解析、en 输出
  CJK 标点 lint、长度比界、锚点重对齐、frontmatter schema、leetcode 标题
  == 官方名。fail 单文件不 fail 批次。
- **收尾自检**：跑 `node scripts/escape-angles.mjs` + `pnpm build`，提交
  slug-map 与 escape 变更（B13），build 路由表 diff 附在 PR。

### Phase 3 — 发布与监测

1. **先拿基线再发布**：GSC 按 `/en/`、`/zh/` 过滤导出 Page-Indexing 各桶
   （soft-404、crawled-not-indexed、duplicate-chose-different-canonical）+
   分 locale 展示/点击，存 `dev_docs/`。
2. **分批发布**：≤25-30 页/deploy、间隔数天、learn/ 先行（源质量最高）、
   leetcode 最后；保持 deploy.yml 的按变更文件 IndexNow（修好 B10 之后），
   永不全量 ping；`lastmod` 只随正文真实变更。
3. **abort 判据（写死在 PR 描述里）**：某批 4 周后 en crawled-not-indexed
   >40%、任何 MT 页被判 soft-404、或 **zh 展示量与批次时间相关地下滑**（站点
   级分类器特征）→ 暂停发布，将该批降 `noindex`（Google 2025-06 官方推荐的
   低质量翻译处置），修完再放。
4. **CI 补课**：content-check.yml 对变更文件跑验证器 + MDX 编译（哪怕只是
   `fumadocs-mdx` 编译变更文件）；这同时补上 B12 的历史欠账。

### Phase 4 — 可选强化（按需）

- LLM-judge QE（GEMBA-MQM prompt，judge≠translator 模型族，只跑 flagged+10%
  抽样）；MetricX-24（Apache-2.0）nightly Python Action。
- 翻译者归因决策落地（见 §6.4）+ CONTRIBUTING.md 补翻译契约文档（命名、docId
  继承、frontmatter 字段、8 个英文原创例外、fuzzy 工作流）。
- `noTranslate: true` 退出机制 + 应请求下架流程（道德权利缓解闭环）。
- Cloudflare 前置（dev_docs 已有的长期爬虫成本方案）安排在最大批次之前。

### 工作量粗估

Phase 0 ≈ 1-2 天；Phase 1 ≈ 2-3 天（含人审回译）；Phase 2 spike 1 天 + 实现
3-5 天；Phase 3 跨 4-6 周日历时间但人力极少。API 成本全程 <$25。

---

## 6. 留给维护者的决策点（真正需要人拍板的，其余照计划执行）

1. **hreflang 语言标签**：`zh-Hans`/`en`（推荐——受众是海外简中读者，按文字
   不锁地区）还是维持 `zh-CN`/`en-US`。改标签是一次性小 PR，但要改就趁 Phase 0。
2. **fallback 政策**：canonical→zh + 出 sitemap（推荐，GitLab 模式，保留可达性）
   还是 `noindex`（miaoosi 模式）。Phase 1 完成后 fallback 只剩极少数，差异不大。
3. **31 篇中文重建来源**：先找你的 hexo 原稿，还是直接接受 en→zh 回译？
   （回译版会带机翻标注挂在你名下——正好是道德权利场景的第一人称体验。）
4. **翻译者归因**：人工校对翻译目前记零贡献。选项：(a) 维持现状并在
   CONTRIBUTING 说明；(b) frontmatter 加 `translationReviewedBy` 页面展示但
   不进排行榜；(c) 校对 commit 降权计入。推荐 (b)——不碰统计管线，可见即激励。
5. **adopt vs build**：Phase 2 的 spike 结论出来后拍板。倾向：fork 逻辑自建
   （仓库已有底盘 + 需要 docId/build 表这些仓库特有集成，外部 Action 的维护
   耦合不值得）。

---

## 7. 附录

### 7.1 `docs-i18n-design.md`（2026-04 设计稿）过时点清单

| 设计稿内容 | 现实 |
| --- | --- |
| 文档在 `app/docs/**`、150 篇、英文近零 | `content/docs/`、304 篇、翻译基本完成 |
| 建议 cookie 决定语言 + IP geo middleware | 已被 URL 段化架构取代（cookie 方案曾把全站钉成 dynamic，是 CPU 事故根因之一） |
| `request.geo` 方案 | Next.js 16 已无此 API；现架构不需要 |
| 步骤表"翻译 150 篇 30-60 分钟" | 已发生两轮；剩余工作是修复与保鲜 |
| "术语不建 JSON 词表" | 被 WMT25/SemEval-2025 证据推翻，成本前提（贵）也已消失 |
| mtime 过期检测 + `[translation-fix]` commit 前缀 | 两者在 CI/squash 下均不工作；改为内容 hash + 三态 TM |
| "合并 zh+en 搜索索引" | 从未实现；现状是分片且 en 分片为空 |
| 翻译成本 $0.25-22 的选型讨论 | 全档位 <$5，成本不再是选型维度 |
| 未提：合规标注、fallback SEO、docId 机械继承、质量门 | 本文 §3.4/§3.5/§5 补齐 |

### 7.2 方法注记（给后续 agent）

- 工作克隆是 **4-graft 浅克隆**：做任何 git 考古先 `git fetch --unshallow`，
  否则 152 个 .en 文件全显示为一个 bot commit。
- 运行时行为验证用"真语料喂真 loader 配置"的探针（vitest 可复用此技术断言
  分片非空），**不要**用 shell 文件名扫描推断页面存在性——dot parser 的丢弃
  行为只有 loader 知道。
- 外部结论中标注日期晚于 2026-06 的（GEMBA V2、Thaler 拒调卷、DeepSeek V4
  定价细节等）来自搜索结果转述，执行前对关键数值（模型 ID、价格）以官方
  文档二次确认。

### 7.3 主要来源

MT 质量：WMT24 findings（aclanthology 2024.wmt-1.1）· WMT25 findings
（2025.wmt-1.22）· Hunyuan-MT 报告（arXiv 2509.05209）· WMT25 Terminology
（2025.wmt-1.30）· COMET 盲区（arXiv 2202.05148）· SemEval-2025 Task 2 ·
LingualX64 方向不对称（Nature Sci Rep 2026）。
工具：Azure/co-op-translator · pelikhan/action-continuous-translation ·
lingo.dev/cli/how-it-works · Lunaria（lunaria.dev/guides/tracking，26 个月
未更新）· google/mdbook-i18n-helpers · Docusaurus i18n/git。
Provider：Anthropic 平台文档（定价/缓存/限额/prefill 移除）· DeepSeek V4
峰谷计价（2026-08-16）· DeepL pro-license（内容许可条款）· terms.law AI
输出权利对比。
法务：LICENSE-CONTENT（in-repo CC BY-NC-SA 4.0 legalcode）· USCO AI
Copyrightability Part 2（2025-01）· 《人工智能生成合成内容标识办法》
（ChinaLawTranslate 译本）· EU AI Act Art. 50 · leetcode.com/terms ·
Kubernetes localization 政策 · MDN Translated_content。
SEO：Google spam policies（scaled content abuse）· 2025-06-11 MT 指南软化
（SEJ/Search Engine Roundtable）· Glenn Gabe Reddit AI 翻译追踪（gsqi.com）·
Google localized-versions / crawl-budget 文档 · GitLab docs MR 833（fallback
canonical 先例）。
QE：Unbabel COMET LICENSE.models.md（NC 许可）· google-research/metricx
（Apache-2.0）· GEMBA-MQM（arXiv 2310.13988）· self-preference bias
（arXiv 2410.21819）· Kubernetes "Human-Centered Automation"（2026-06-26）。
