# 双语翻译流水线盲点分析与执行计划（2026-07）

> 任务：在动手实现"翻译流水线 v2"之前做一次 blindspot pass——找出 unknown
> unknowns、误导性的评测假设、质量损失风险、各 provider 的具体限制、许可合规
> 问题，以及"真正差异化"的机会（而不是重造已有轮子）。
>
> 本文是**研究综合 + 可移交执行计划**：另一个工程 agent 拿到本文即可开工，
> 不需要重新踩一遍问题空间。所有仓库内结论都在当前 main（`eade8e6`）上
> 逐条验证过；所有外部事实标注了来源与时效（**均为 2026-07 中旬快照**）。

---

## 1. 现状快照（与常见认知的差异）

先纠正几个容易拿旧文档当真的点——`docs-i18n-design.md`（2026-04 设计稿）
描述的世界已经和仓库现实脱节：

| 认知 | 现实（已验证） |
| --- | --- |
| "150 篇文档待翻译" | **151 篇 zh 侧文档已有 152 个 `.en.*` 对应文件，覆盖率 ≈ 100%**。分两批完成（translatedAt 2026-04-15 / 2026-05-11，translatorAgent `claude-sonnet-4-6`） |
| "翻译脚本 `translate-docs.mjs`" | **从未 commit 进仓库**。`scripts/` 无此文件，git 全历史无痕迹，package.json 无入口。两批翻译是在仓库外跑的——**流水线目前不可复现，bus factor = 1** |
| "cookie/IP 判断 locale" | 已被 2026-05 的 URL 段化方案取代（`/zh/…` `/en/…`，见 `dev_docs/i18n_url_routing.md`） |
| "搜索合并 zh+en 索引"（4 月已拍板） | **没做**。现状是按 locale 分片的静态 Orama 索引（`app/search.zh.json` / `search.en.json`），中英互相看不见 |
| "`[translation-fix]` 前缀保护人工修正" | **没做**。今天任何一次重跑翻译都会静默覆盖人工修正 |
| "`noTranslate` 逃生门" | 设计了，0 个文件使用，0 处代码支持 |

其余关键事实：

- fumadocs i18n：`parser:'dot'`、defaultLanguage `zh`、fallbackLanguage `zh`
  （`lib/source.ts`）——`.en` 缺失时英文 URL 渲染中文原文。
- 贡献者统计：`backfill-contributors.mjs` 对含 `translatedFrom` frontmatter
  的文件直接跳过（第 174-176、492-493 行），按设计工作。
- 语料规模：zh 侧 468,724 字符，**20% 在代码块内**；全量翻一遍约 40-70 万
  token 输入 + 相当量输出。
- Giscus 评论硬编码 `lang="zh-CN"`；hreflang / sitemap 对每篇文档无条件输出
  zh+en 两个 alternate（不管 `.en` 文件是否存在）。

---

## 2. Unknown unknowns（仓库内实证发现的盲点）

这些不是理论风险，是已经发生、但没人注意到的事：

### 2.1 时间戳法判断"翻译过期"结构性失效

用 `git log -1` 比对 zh/en 文件日期，36/82 对显示"原文比翻译新"——但逐一
核查后发现触碰 zh 文件的是 `e5de136`（deepseek 批量回填 253 个 description，
**只改 frontmatter**）。批量 commit（目录迁移 `e74b5fd`、描述回填）会把
全仓文件日期一次性打乱；`translatedAt` 又都是手填整点（08:00:00Z /
12:00:00Z），无机器可信度。**结论：唯一可靠的过期检测原语是正文内容哈希
（sourceHash），不是任何时间戳。**

### 2.2 命名规范已经分裂成三套并存

1. `foo.mdx` + `foo.en.mdx`（zh 原文 + en 翻译）——主流；
2. `foo.en.md` + `foo.zh.md`、**无不带后缀文件**（en 原文 + zh 翻译）——
   10 个文件，集中在 leetcode 目录，且 `lib/source.ts` 注释还声称
   "`.zh.*` 不应该出现"（注释已过时）；
3. 中文文件名 + 空格文件名——29 个文件名含汉字，并已产生**重复文档**：
   `2894. 分类求和并作差.md` 与 `2894-divisible-and-non-divisible-sums-difference.en.md`
   并存、`9021_TUT_3_25T1.md` 与 `9021-tut-3-25t1.en.md` 并存（同题两套
   base name）。任何自动化流水线在这套目录上跑都会放大混乱。

### 2.3 已上线的 LLM 幻觉产物

`9021_TUT_3_25T1.en.md` 的 description（deepseek 回填）声称
"LeetCode 9021. Solution…"——**9021 是 UNSW COMP9021 课程编号，不是
LeetCode 题号**。幻觉元数据已在生产环境、进了 SEO。这证明"description /
翻译这类低风险生成"同样需要事实性抽查，不能默认可信。

### 2.4 结构漂移已存在

7/120 zh↔en 对的 heading 数量不一致。锚点问题更隐蔽：fumadocs 从 heading
文本派生锚点 id，**翻译改变 heading → 锚点 slug 变 → 跨文档深链
`/docs/x#中文锚点` 在英文版 404**（微软 co-op-translator 生产事故清单里
的原样条目，我们已具备全部前置条件）。

### 2.5 激励与治理反噬

翻译文件不计贡献者（防刷分，正确）——副作用是**人工修正 `.en.mdx` 的人
得不到任何排行榜积分**，而下一次批量重翻还会覆盖他的修正。当前机制主动
劝退唯一能提升翻译质量的人群。

### 2.6 SEO fallback 陷阱（新文档必踩）

新增 zh 文档在 `.en` 生成前：`/en/docs/新文档` 渲染中文正文，但 metadata
无条件宣告 hreflang `en-US` + sitemap 双语收录 → Google 收到"自称英文页
的中文内容"。覆盖率 100% 时无感，**每篇新文档在翻译延迟窗口内都会踩**。

---

## 3. 误导性的评测假设（研究综合）

> 详细来源见各条内链；分层标注：✅ 强证据 / ⚠️ 合理但弱源 / ❓ 未解。

- ✅ **BLEU/chrF 对本场景不适用**：无参考译文可用；sacrebleu 的 zh 分词器
  假设全角标点，中英混排技术文直接违反；n-gram 指标系统性低估意译型 LLM
  输出（[WMT metrics](https://aclanthology.org/2024.wmt-1.2/)、
  [sacrebleu issue](https://lightrun.com/answers/mjpost-sacrebleu-inkonsistent-tokenization-for-zh-in-ter-and-bleu-computation)）。
- ✅ **翻译能力不是瓶颈，验证才是**：WMT24 人评 Claude 3.5 Sonnet 11 个语向
  赢 9 个、排名第一（[findings](https://aclanthology.org/2024.wmt-1.1/)）；
  但同届 COMET 把 Tower-70B 排第一——**指标可以被刷**，metric-human 分裂
  在官方结果里就有。
- ✅ **QE 指标对最危险的失败模式失明**：COMET-Kiwi 类无参考质量估计
  **区分不出幻觉与轻微错误**（[Guerreiro et al.](https://arxiv.org/pdf/2208.05309)），
  历史版本对数字/实体错误不敏感。用 QE 分做唯一门禁 = 恰好放过最严重的
  一类错误。
- ✅ **LLM-as-judge 偏置已量化**：自偏好 ~10-25%（机制是低困惑度偏好，
  Claude 判 Claude 会通胀，[NeurIPS 2024](https://arxiv.org/abs/2410.21819)）；
  冗长偏好 15-30 分；位置偏好 10-15 分。整篇文档喂给 judge 还会随长度
  退化（[EMNLP 2025](https://arxiv.org/abs/2505.01761)）——"让 Claude
  通读全文打个分"是可测量的坏方案。缓解：分段评、MQM 风格 rubric、
  A/B 位置对换取平均、source-anchored、跨家族（DeepSeek 判 Claude）。
- ✅ **长文档 LLM 翻译的头号风险是静默漏译**：多句一起翻时漏句是
  DocMT-LLM 的系统性失败模式，随上下文长度增长
  （[DelTA](https://arxiv.org/pdf/2410.08143)）；结构破坏（fence 断裂、
  placeholder 错位、锚点漂移）有生产事故实录
  （[微软 co-op-translator postmortem](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/fixing-broken-markdown-in-ai-translation-hardening-a-production-pipeline/4511378)）。
- ✅ **本仓库实证：朴素启发式误报率高**。字符长度比 en/zh 中位数 2.12、
  离散 0.70-3.12——低值多为 en→zh 方向对或"原文本来就大半是英文/代码"
  （论文清单页、COMP9021 教程），高值（2.9-3.1×）核查后是正常展开而非
  幻觉。**长度比必须按 heading 分段算、按翻译方向分桶、按代码占比修正**，
  整文件一刀切会淹没在误报里。
- ⚠️ round-trip BLEU 是差的质量信号（多次复现），但"分段 embedding
  round-trip 做漏译绊线"有初步文献支持，未经大规模生产验证。
- ❓ 没有任何公开指标在 markup-heavy MDX 上验证过；术语跨 300 篇一致性
  没有现成 benchmark——都得自建。

**推论（评测设计的地基）**：确定性结构门禁是质量下限的真正保障，
LLM/QE 评分只做分诊路由（挑出最差尾部给人看），永远不做唯一放行依据。

---

## 4. 工具版图：造轮子 vs 差异化（研究综合）

结论先行：**fumadocs `.{locale}.mdx` 后缀模型 + zh→en 方向是确证的空白
生态位**——没有任何现成工具直接覆盖本仓库形态。

- **唯一值得先评估再决定自建的**：[Lingo.dev CLI](https://github.com/lingodotdev/lingo.dev)
  （Apache-2.0，支持 BYOK-Anthropic 纯按模型成本跑）。其核心资产是
  committed `i18n.lock`（SHA-256 内容哈希，只重翻变更内容）。**两个
  未验证点决定采用与否**：(a) 对本仓库 MDX 组件（`<Cards>`/`<Callout>`
  等 JSX 属性）的保真度；(b) bucket 路径模式能否表达"同目录 `.en` 后缀"
  而不是"每 locale 一个目录"。各花 1 小时 PoC 即可判死刑或采用。
- **微软 co-op-translator**：不采用（无 MDX、en→多语架构、无 glossary），
  但其 markdown 加固 postmortem 是必读的失败模式清单。
- Crowdin/Tolgee/Weblate：TMS 形态，适合 `messages/` UI 字符串，不适合
  300 篇 git-native MDX（Weblate 的 md 同步还是单向的）。
- OSS 脚本（gpt-translate / chatgpt-md-translator / tcapelle-gpt_translate）:
  全部一次性、无哈希增量、无 post-edit 保护；tcapelle 的 per-language
  术语词典 + LLM-judge 门禁是唯一值得借鉴的模式。

**全生态皆缺、即本项目的差异化机会**（做出来就是真正领先，而非重造）：

1. **段级翻译记忆（segment-level TM）**：`{段落内容哈希 → 译文}` 映射表
  commit 进 git。改一段只重翻一段；相同段落跨文件复用；术语一致性随
  TM 自然提升。Lingo 的 lockfile 只是变更检测（无 source→target 对），
  没有任何 OSS 工具做到段级 TM over MDX。
2. **三方合并的人工修正保护**：对 source 段和 target 段各存哈希——
  "source 变了 && target 被人改过 → 标记人工 review 而不是静默覆盖"。
  现有工具最好的语义（Lingo）也只是"改前保留、改后丢弃"。
3. **锚点钉扎**：翻译前把 zh heading 的锚点 id 显式固化
  （fumadocs 支持 `## 标题 [#custom-id]`），保证 zh/en 锚点 URL 恒等，
  跨语言深链永不断。生态内无自动化实现。
4. **贡献者归因感知**：翻译文件 frontmatter 携带原文作者归因（满足
  CC BY 条款，见 §6），人工修正翻译以某种机制计入贡献（解 §2.5 的
  激励反噬）——全生态空白。
5. **CI 结构门禁**：MDX 编译通过 + fence 字节等同 + 链接/锚点可解析 +
  frontmatter schema 合法 + 残留 CJK 检测 → 不过即 build fail。结构
  验证用现有 fumadocs 工具链就是免费的，而"翻译 bug 大多是结构 bug"
  有生产数据支撑。

---

## 5. Provider 限制与经济账（2026-07 中旬，时效敏感）

| | 关键事实 | 对本项目的含义 |
| --- | --- | --- |
| **Anthropic API** | Sonnet 5 $3/$15（**intro $2/$10 至 2026-08-31**）、Haiku 4.5 $1/$5；输出上限 128K；**Batches API 全 token 五折**，<1h 常见；prompt cache 读 ≈0.1×，**最小可缓存前缀 2048-4096 token**（太短的 glossary 静默不缓存）；Commercial Terms：**不训练 API 输入、输出权利转让给客户**（已验证） | 全量重翻 ~$16-32（batched Sonnet 级）。**成本可忽略，工程时间才是成本**。合规干净 |
| **DeepSeek** | V4-Flash ~$0.14/$0.28（二手价）；**ToS 默认可用输入输出改进服务（训练相邻）**、数据 PRC 驻留；2026-03 曾 7h 全断，批处理可容忍 | 便宜但 **ToS 与 NC 内容 + 贡献者预期冲突**（§6）；description 幻觉前科在本仓库（§2.3）。只做兜底且需公示 |
| **DeepL** | **无 markdown tag_handling**（只有 html/xml），文档端点不收 .md；glossary 的 zh 支持据二手源已解决（未一手验证） | 需要 md→html→md 往返工程，zh 技术文质量无优势——**不值得** |
| **Google Cloud Translation** | 按**字符**计价（NMT $20/M chars；Translation LLM $10+$10/M chars）；v3 glossary 支持 zh；同样只收 text/html | 字符计价对中文语料不利，同样有 markdown 工程税——不值得 |

结论：**Anthropic API + Message Batches + 缓存 glossary 前缀**是唯一
同时满足质量、成本、合规的选项。注意 4 月那批用的"限时免费 Claude
Token"不是可持续成本基础；OSS 维护者可申请 "Claude for Open Source"
（Max 订阅 6 个月）——但订阅走的是**消费者条款**（2025-08 起默认训练、
可 opt-out），流水线正式跑要走 API 而非订阅。

**长文档操作红线**：翻译输出 ≈ 输入长度，超限时 `stop_reason:
"max_tokens"` 静默截断——必须按 heading 分块、逐块断言 `end_turn`。

---

## 6. 许可与合规（映射问题空间，非法律意见）

- ✅ **路径干净**：CC BY-NC-SA 4.0 legal code 明文把 "translated" 列为
  Adapted Material → 机器翻译是演绎作品 → ShareAlike 强制译文继续用
  BY-NC-SA 4.0——**和仓库现状完全一致，无许可冲突**。
- **归因义务（§3(a)）要落实到文件里**：译文需保留创作者标识、原文链接、
  **"已修改"声明**。执行方式：`.en.mdx` frontmatter 增加原文路径 +
  "由 [model] 机翻自中文原文，未经人工审校" 声明；贡献者归因走原文
  git 历史（MDN "Mozilla Contributors" 集体归因模式）。**当前 152 个
  `.en` 文件都没有这些字段——存量欠账**。
- **NC 与付费 API**：付钱给 Anthropic 处理内容 ≈ 付钱给印刷厂，不构成
  商业性使用（CC 2025 legal primer 的通行解释）。**真正的摩擦点是
  provider 拿输入去训练**——那是 provider 对贡献者 NC 内容的自行商用：
  Anthropic API 默认不训（干净），DeepSeek 默认可用（冲突）。低成本
  缓解：CONTRIBUTING.md 明示"投稿可能经第三方 LLM API 机器翻译"。
- **先例**：Kubernetes（"纯机翻不足以发布"，人审门禁）；MDN（机翻
  locale 是生成物、原文变更即覆盖、独立仓库）；Vue zh 文档（译文同
  BY-NC-SA 4.0）。共同点：**译文同源许可 + 每页链回原文 + 机翻必须
  标注**。

---

## 7. 执行计划（分期，每期独立可验收，可直接移交）

> 通用约束：遵守 CLAUDE.md——路由类改动用 `pnpm build` 前后表 diff 验证；
> 新 AI 端点必须挂 `lib/rate-limit.ts`；注释只写非显然约束。
> 每期结束跑 `pnpm build && pnpm test && pnpm typecheck`。

### Phase 0 — 语料卫生（先于一切自动化，约 1 天）

自动化会放大 §2.2 的混乱，必须先清：

1. 写 `scripts/check-translation-integrity.mjs`（后续进 CI）：
   校验 (a) 每个 docId 恰好一个非翻译文件；(b) `.en`/`.zh` 后缀文件必有
   配对源文件；(c) 重复 base name 检测（抓 `2894.*` / `9021*` 这类）；
   (d) frontmatter `lang`/`translatedFrom` 与文件后缀自洽。
2. 人工决策清单（跑完脚本产出报告贴 PR）：合并重复文档（保 docId 较早
   者）、把中文/空格文件名规范化为 kebab-case（**改 leetcode 文件名后
   必须 `pnpm build` 同步 slug map**，CLAUDE.md §5）。
3. 修正 `lib/source.ts` 里关于 `.zh.*` 的过时注释。
4. 验收：integrity 脚本零报错；build 表 diff 无路由回退。

### Phase 1 — 可复现的翻译脚本 + 段级哈希（核心，约 3-5 天）

**前置 PoC（各 ≤1h，先做再决定自建范围）**：用 3 篇含 `<Cards>`/`<Callout>`
/math 的真实文档测 Lingo.dev CLI（BYOK-Anthropic）：JSX 保真？`.en` 后缀
路径可配置？→ 都过则底层翻译执行交给它、本仓库只做包装与门禁；任一不过
则完全自建（下述设计按自建写，采用 Lingo 时 1.2-1.3 换成其 lockfile）。

1. `scripts/translate-docs.mjs`（进仓库！§1 的教训）：
   remark/mdast 解析 → 按 heading 分块 → 保护段（code fence、math、
   ESM import/export、JSX 组件名与属性名、URL）placeholder 化 →
   Anthropic **Batches API**（Sonnet 5，intro 价至 2026-08-31）逐块翻译，
   glossary + 系统提示放缓存前缀（**凑够 2048+ token 否则不缓存**）→
   逐块断言 `stop_reason === "end_turn"`（防静默截断）→ 还原 placeholder
   （集合不等 = 硬失败重试）→ 序列化。
2. `generated/translation-memory.json`（commit 进 git，同 slug-map 先例）：
   `{ docId: { segHash: { target, targetHash, model, at } } }`。
   只重翻 sourceHash 变更的段；相同段跨文件复用。**这就是 §3 结论的
   落地：过期检测 = 哈希，不是任何时间戳**。
3. 三方保护：写 `.en` 文件前比对现存段的 targetHash——不匹配（被人改过）
   且 source 也变了 → 该段不覆盖，输出到
   `generated/translation-conflicts.md` 报告人工处理。
4. 锚点钉扎：翻译前给 zh 原文 heading 注入 `[#slug]` 显式 id（一次性
   codemod + 新文档 CI 检查），译文继承同 id。
5. frontmatter 治理：译文自动带 `translatedFrom` / `sourceDocPath` /
   `sourceHash` / 机翻声明字段（§6 归因欠账在首次全量刷新时一并补）。
   实现 `noTranslate: true` 支持（设计已承诺）。
6. 验收：对 5 篇改动过一段的文档跑脚本——只有该段重翻、人工改过的段
   产生 conflict 报告、锚点 id 前后一致、`pnpm build` 通过。

### Phase 2 — CI 质量门禁（约 2 天）

1. 确定性硬门禁（不过 = build fail）：MDX 编译；fence 数量与内容
   字节等同（允许翻译注释需显式白名单）；placeholder 集合等同；内外链
   与锚点可解析；frontmatter schema；残留 CJK 检测（**跳过 code/inline
   code/引用块**——中英混排语料会误报，§3 实证）。
2. 启发式软门禁（报告不拦截）：**分段**长度比（按方向分桶：zh→en 段
   预期 1.5-2.8×，超界只标记）；heading 数量比对。
3. LLM 分诊层（可选，P2 末）：对软门禁标记段做 MQM-prompted 分段评审
   ——source-anchored、A/B 位置对换、**不用 claude 判 claude**（用
   Haiku 判 Sonnet 或反之）；输出 review 队列而非阻塞。
4. 验收：人为构造漏段/断 fence/改锚点的译文各一，CI 全部拦下。

### Phase 3 — 治理与产品收尾（约 2 天）

1. hreflang 修正：`.en` 不存在时不宣告 `en-US` alternate、sitemap 不收
   `/en/` 条目（解 §2.6）；fallback 页顶部加"暂无英文版"提示条。
2. 贡献激励：人工修正翻译的 commit 以某种规则计入贡献者统计（如：
   `.en` 文件的**非 bot 作者** commit 计数）——改
   `backfill-contributors.mjs` 的跳过逻辑为"跳过 bot 作者的翻译 commit"
   而非"跳过整个文件"。需维护者拍板规则再动。
3. CONTRIBUTING.md：补多语言维护指南（写作流程不变 + 机翻声明 + 如何
   修正翻译）；加"投稿可能经第三方 LLM API 翻译"告知（§6）。
4. Giscus locale 跟随 + 决策：zh/en 页评论线程合并 or 分开（需产品决策）。
5. 搜索：要么实现 4 月拍板的跨语言合并索引，要么正式留言废弃该决策
   ——不要继续让决策静默烂尾（§1 教训）。

### Phase 4 — 运行机制（半天 + 长期）

1. 触发：GitHub Action 在 `content/docs/**` 变更的 push 后跑
   translate → 有 diff 则 bot commit 回 main（`[skip ci]`，参照
   `sync-uuid.yml` 模式）。排行榜已过滤 bot 作者，无污染。
2. 预算护栏：Action 里对单次运行 token 消耗设上限告警；月度成本预期
   个位数美元（§5），超限即说明有 bug 而不是该降级 observability
   （CLAUDE.md §1 的次序）。
3. 时效提醒：Sonnet 5 intro 价 2026-08-31 到期；届时重估 Haiku 4.5
   混跑短文档。

### 需要维护者决策的事项（不阻塞 Phase 0-1）

1. Phase 0 重复文档合并清单的最终裁决；
2. 人工修正翻译的贡献计分规则（Phase 3.2）;
3. Giscus 评论线程 zh/en 合并与否；
4. 跨语言搜索：做 or 正式废弃；
5. DeepSeek 是否保留为兜底 provider（若保留需在 CONTRIBUTING 公示其
   ToS 训练条款）。

---

## 8. 一句话总结

翻译"能力"早已不是问题（语料已 100% 翻完、Claude 是 WMT24 人评第一的
翻译器、全量重翻只要几十美元）；**真正的工程对象是可复现性（脚本进仓库）、
段级哈希驱动的增量与记忆、人工修正的三方保护、锚点/结构/归因的确定性
门禁**——这四样在现有工具生态里全是空白，做出来即是差异化，而所有
时间戳启发式、整文件长度比、单一 LLM 打分的"省事方案"都已被本仓库
实证或文献证伪。
