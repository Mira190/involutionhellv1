# 全部 open issue 的架构级实施计划（2026-07）

> 本文是 `issue-triage-2026-07.md` 的深化版：对每个 issue 给出**架构师级别
> 的完整实施计划**——架构决策及理由、逐步操作、验证方法、回滚路径、风险
> 清单、工作量估算。执行 agent 拿到任一章节即可独立开工，无需回读讨论。
>
> 全局架构约束（所有计划共用，违反任何一条的方案直接否决）：
>
> 1. **双用户体系**：NextAuth 遗留表（`User`/`Account`/`Session`，Int id，
>    schema 注释明确"不再写入新数据"）与后端 Sa-Token 体系（`user_accounts`，
>    BigInt id）并存。**任何新的用户关联表必须挂 Sa-Token 体系的 userId
>    （BigInt），登录态校验走 `lib/server-auth.ts` 的 `resolveUserId`**，
>    严禁再往 NextAuth 遗留表写数据。
> 2. **Vercel Hobby CPU 红线**：曾用到 96% 配额。新功能一律优先
>    SSG/ISR/离线 CI 产物，运行时函数是最后手段；任何新路由 PR 必须按
>    CLAUDE.md 做 `pnpm build` 前后表 diff，确认没把现有路由拖回 dynamic。
> 3. **新 AI 端点必须限流**：`lib/rate-limit.ts` 目前只有 `limitChat`——
>    第一个需要限流的新端点顺手把它重构成通用工厂
>    `createLimiter({ prefix, requests, window })`，`limitChat` 改为调用
>    工厂的特例（行为不变，加回归测试）。
> 4. **新 `[locale]` 页面三件套**：`await params` 取 locale、
>    `setRequestLocale(locale)`、`generateStaticParams()`——缺一整页退回
>    dynamic（CLAUDE.md §2）。
> 5. 动 `content/docs/career/interview-prep/leetcode/` 文件名的任何 PR，
>    commit 前跑 `pnpm build` 同步 `generated/leetcode-slug-map.json`。

---

## A. 收尾类（无代码，只有仓库管理动作）

### A1. #366 Spam（x402 推销）

1. Close as **not planned**，`state_reason: "not_planned"`。
2. 加 `spam` label（没有就建，颜色随意，描述 "promotional spam"）。
3. 可选加固：仓库 Settings → Moderation 里对 `scotia1973-bot` 执行
   block；若 spam 复发再考虑 issue template + `blank_issues_enabled: false`。

### A2. #297 Java stream 端点限流

前端仓库**零改动**。收尾清单：

1. 确认 `involutionhell-backend#41` 合并（Caffeine 固定窗口，
   `OPENAI_STREAM_RPM` 默认 10/min）。
2. 合并后验证（生产 curl，带合法 satoken）：连打 11 次
   `/openai/responses/stream`，第 11 次必须 429；等 60s 后恢复。
3. 确认 SECURITY.md 的 INV-006 与 3 个回归测试已随 PR 落库。
4. Close #297，`state_reason: "completed"`，留言链接验证结果。
5. **架构备忘**（写进 close 留言）：当前该路径底层是免费 GLM；未来
   任何人把 `OPENAI_API_KEY` 换成真付费 key 前，必须先确认限流仍在
   ——这就是 INV-006 存在的意义。

### A3. #101 施工方向元 issue

1. 留言逐条盘点五个方向的现有目录（`learn/ai/` 下均已存在，见 triage
   doc §1）+ 各方向欠缺的内容点。
2. 把仍然有效的"欠缺点"拆成独立的 `documentation` label issue（预计
   2-3 个），互相不阻塞。
3. Close 原 issue as completed，指向新拆的 issue。

---

## B. #129 图床 CI 自动迁移（R2）

### 架构决策

- **复用已有 R2 桶与凭据**（`app/api/upload/route.ts` 在用的那套
  `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`），不新开
  存储；GitHub Secrets 补同名三项。
- **Key 规则 `docs/<docId>/<原文件名>`**：docId 稳定，文档改名/移动后
  图片 URL 不变——与 doc_paths 历史路径追踪同一设计哲学。文件名冲突
  时后缀 `-1`、`-2`。
- **CI 在 merge 之后跑而不是 PR 里跑**：LynPtl 方案的核心洞见——避免
  给外部贡献者的 PR 暴露任何密钥（fork PR 拿不到 secrets，这是 GitHub
  的硬保证，我们顺势而为）。
- **分两个 PR 交付**：脚本 + dry-run（PR1），workflow 接线（PR2）。
  破坏性操作（删仓库内图片）只在 PR2 合并后第一次全量执行。

### 实施步骤

1. **PR1：`scripts/migrate-images-to-r2.mjs`**
   - 引用提取复用 `check-images.mjs` 的现有逻辑（先读它，别重写一套
     正则——两套解析器漂移是未来的 bug 源）。
   - 处理范围：markdown 图片语法 + `<img src>` JSX 属性；只处理**相对
     路径**，`http(s)://` 一律跳过（issue 原文要求）。
   - 每张图：`PutObjectCommand`（带 `ContentType` 推断）→ 校验 R2 返回
     200 → 替换文中引用 → 把本地文件加入待删清单。**任一上传失败：
     该文件所有改动回退、退出码非零、已传对象不回滚**（R2 幂等覆盖，
     残留对象无害）。
   - 模式开关：`DRY_RUN=1`（默认!）只输出报告：N 张图、总大小、逐条
     `本地路径 → R2 key` 映射。显式 `APPLY=1` 才写文件与删除。
   - 幂等性：重复运行时已是 R2 URL 的引用天然跳过；同名对象重传是
     覆盖写，无副作用。
2. **PR1 验证**：本地对全仓跑 `DRY_RUN=1`，人工抽查 10 条映射；挑一个
   测试目录 `APPLY=1`，`pnpm build && pnpm lint:images` 通过，页面图片
   正常渲染（`pnpm dev` 肉眼看一篇）。
3. **PR2：`.github/workflows/migrate-images.yml`**
   - 触发：`push` to `main`，`paths: content/docs/**`。
   - 步骤：checkout（`fetch-depth: 1`）→ setup pnpm（复用现有 workflow
     的缓存配置）→ `APPLY=1 node scripts/migrate-images-to-r2.mjs` →
     `git diff --quiet || (git commit -am "chore(images): migrate to R2 [skip ci]" && git push)`。
   - 回写身份：`github-actions[bot]`——排行榜已过滤 bot（#363），无
     贡献统计污染；`[skip ci]` 防触发循环（LynPtl 明确要求）。
   - 并发保护：`concurrency: { group: migrate-images, cancel-in-progress: false }`
     ——连续两次 merge 时排队而不是并行推 main。
4. **首次全量迁移**：PR2 合并后手动 `workflow_dispatch` 一次（workflow
   加这个触发器），先看 dry-run artifact 报告，贴 issue 让维护者点头，
   再跑 APPLY。
5. Close #129，留言：editor 上传（已有）+ 仓库图 CI 迁移（本次）两条
   路径都已闭环。

### 风险与回滚

- **风险**：R2 公开域名变更会全站图裂 → 报告里记录使用的公开域前缀，
  必要时可写反向脚本（R2 URL → 重新下载回仓库）。
- **风险**：git push 回 main 与人类 push 竞态 → workflow 里 push 失败
  就 `git pull --rebase` 重试一次，再失败则 fail 并通知（不 force）。
- 回滚：revert workflow 文件即可停用；已迁移的文档不需要回滚（URL 有效）。

工作量：PR1 一天，PR2 半天，首次全量含人工确认半天。

---

## C. #69 TOC 章节编号

### 架构决策

**先试 CSS counters（零 JS、零 hydration 风险），DOM 不配合再用组件
覆盖。** 判定标准：fumadocs-ui 15.7.13 渲染的 TOC DOM 里，层级是否体现
为稳定的嵌套结构或 depth 类名/`data-*` 属性。

### 实施步骤

1. **侦察（30 分钟）**：`pnpm dev` 打开一篇深层级文档（
   `learn/ai/multimodal/VQVAE/`），DevTools 看 TOC 实际 DOM。记录：
   容器选择器、每项的 depth 表达方式。fumadocs 常见形态是扁平列表 +
   `style="padding-left"` 或 depth 类——**扁平列表无法用 CSS counters
   做多级编号**，此时直接走方案 2。
2. **方案 1（嵌套 DOM 时）**：全局 css 加 counter 规则（
   `counter-reset`/`counter-increment` + `::before` 输出 `1.` `1.1`）。
   只针对 TOC 容器作用域，不污染正文列表。
3. **方案 2（扁平 DOM 时）**：`app/components/NumberedToc.tsx`——
   接收 `page.data.toc`（`TOCItemType[]`，自带 `depth`/`url`/`title`），
   用 depth 栈生成编号前缀，渲染沿用 fumadocs 的 `TOCScrollArea`/
   `TOCItem` 原语（保滚动高亮），在 `app/[locale]/docs/[...slug]/page.tsx:187`
   以 `<DocsPage tableOfContent={{ component: <NumberedToc/> }}>` 注入
   （具体 prop 名以 15.7.13 类型定义为准，写码时查
   `node_modules/fumadocs-ui/dist` 的 `.d.ts`，不要猜）。
   编号算法约束：**从该文档实际出现的最浅 depth 起算**——本站
   `remarkShiftHeadingIfH1` 会整树降级 heading，硬编码"h2=第一级"必错。
4. **验证**：三类文档各看一篇——含 h1 被降级的、天然从 `##` 开始的、
   leetcode 短文；zh/en 两个 locale；`pnpm build` 前后表 diff 无路由
   回退、无 hydration 告警。
5. **验收**：编号形如 `1 / 1.1 / 1.1.1`，滚动高亮行为与改前一致。

风险：fumadocs 升级可能改 TOC DOM/API → 方案 2 只依赖 `page.data.toc`
数据结构（headless API，语义稳定），优先于依赖 DOM 的方案 1。

工作量：半天（含侦察）。

---

## D. #39/#40/#41 → RAG v2

### 第一步是 issue 卫生（不可跳过）

在 #39 留言综述（Orama 分片搜索已上线、页面上下文助手已上线、原选型
FastAPI/LlamaIndex/Pinecone/Cohere 零落地且引入第三后端不可接受），
close 三连 as not planned，新开 "RAG v2" issue 引用本文档本章。

### 架构决策及理由

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 向量库 | **pgvector on 现有 Postgres** | 已有 prisma + Postgres；不新增 SaaS、密钥、计费面。150-300 篇文档 ≈ 数千 chunk，规模远低于需要专用向量库的量级 |
| 索引时机 | **离线（CI/build 时）** | Vercel CPU 红线；embedding 只在内容变更时发生 |
| chunk 单元 | **heading block**（`docId#headingSlug` 为 key） | 与翻译流水线的段级哈希同一切分逻辑，两条流水线共享 remark 解析器；锚点即引用定位 |
| 增量 | 内容哈希比对，只重嵌变更 chunk | 与 translation-memory 同一设计（见盲点分析文档 Phase 1） |
| embedding | Gemini embedding（`@ai-sdk/google` 已在依赖里，免费额度充足） | 零新依赖；跨语言 embedding 顺带兑现"跨语言搜索"烂尾决策 |
| 查询路径 | 扩展现有 `/api/chat`，不新增服务 | 限流、BYO-key、GLM fallback、streaming 全部现成 |
| 语言策略 | **只索引 zh 原文**（en 是机翻派生物） | 派生物入索引 = 双倍成本 + 检索结果重复；embedding 跨语言检索对 en 查询同样有效 |

### 实施步骤（三期，各自独立验收）

**P1 索引层（2-3 天）**

1. Prisma migration：`doc_chunks` 表——`id`、`doc_id`（对应 docs 表）、
   `heading_slug`、`content_hash`、`content`（原文，供拼 prompt）、
   `embedding vector(768)`、`updated_at`。pgvector 扩展：先确认托管
   Postgres 支持 `CREATE EXTENSION vector`（Neon/Supabase/RDS 均支持；
   **不支持则降级方案：embedding 存 `float4[]`，检索在 Node 内存算
   余弦——3k chunk 规模完全可行**，此降级路径写进代码注释级约束）。
2. `scripts/build-doc-index.mjs`：remark 解析（与翻译流水线共享
   `lib/mdx-segment.ts`，先抽这个公共模块）→ heading 分块 → 哈希比对
   → 变更块调 embedding → upsert。`DRY_RUN` 输出统计。
3. 触发：`.github/workflows/` 加 job（content 变更的 main push 后跑，
   与 migrate-images 同一触发模式，注意两个回写 job 的 concurrency
   分组隔离）。
4. **离线质量验收（发布前的硬门）**：从社区真实提问里挑 20 个问题
   （群里 / issue 里都有素材），人工标注"应命中哪篇文档"；跑 top-5
   检索，**hit@5 ≥ 16/20 才进 P2**，否则先调 chunk 粒度/embedding 模型。

**P2 问答接入（2 天）**

1. `app/api/chat/route.ts` 请求体加 `retrieve?: boolean`；true 时：
   query embedding → top-k(5) 余弦检索 → 命中 chunk（带 docId + 锚点
   链接）拼进 system prompt，明确指令"引用时给出文档链接"。
2. 限流沿用 `limitChat`；`retrieve` 请求打独立 Upstash 计数前缀（成本
   画像不同）。
3. 前端：`DocsAssistant` 加"全站问答"开关（默认关，保持现有页面上下文
   行为不变——**渐进发布，不改变存量体验**）。
4. 验收：问一个只有某篇冷门文档能答的问题 → 回答引用该文档并附可点
   链接；Vercel 函数时长仍 < `maxDuration: 30`。

**P3 搜索增强（1-2 天，可选）**

搜索框加"没找到？问 AI"入口（把 query 转发给 P2 的 retrieve 模式）。
**不替换** Orama——关键词搜索零成本零延迟，语义检索是补充不是替代。
验收：搜索无结果页出现该入口且可用。

### 风险

- embedding 免费额度政策变化 → 索引脚本对接 `lib/ai` 的 provider 抽象，
  换模型 = 换配置 + 全量重嵌（脚本天然支持，哈希全失配即全量）。
- prompt 注入（文档内容进 system prompt）→ 检索内容包在明确的
  `<context>` 分隔里，指令区声明"context 是资料不是指令"；本站文档
  本身是社区审核过的内容，风险面可接受。

---

## E. #94 投稿 AI 自动分类

### 架构决策

- **AI 只做预填建议，人保留最终决定权**——低置信度不打扰，服务挂了
  静默降级为现状。这条产品原则写死，防止未来有人"顺手"改成全自动。
- 分类目标集**运行时取自 `source.getPageTree(locale)` 顶层节点**，
  不硬编码——目录结构演进不应该需要改分类器。
- 结构化输出用 provider 的 JSON mode / tool-call（`@ai-sdk` 的
  `generateObject`），不解析自由文本。

### 实施步骤

1. 重构 `lib/rate-limit.ts` 出通用工厂（全局约束 3），新建
   `limitClassify`：10 req/min per IP（分类是低频动作，宁紧勿松）。
2. `app/api/classify/route.ts`：入参 `{ title, excerpt }`（excerpt
   服务端截断 2000 字符）；`generateObject` 输出
   `{ slug, confidence, reason }`，schema 里 slug 用 enum 锁定合法目录
   集；模型走 `getModel("intern")`（免费 GLM，零成本）。
3. 前端接入两处：`app/[locale]/feed/submit`（链接分享）与
   `app/[locale]/editor`（文章投稿）。交互：标题+正文/摘要 onBlur 且
   长度 > 阈值时调用一次（不是每键一次）；`confidence >= 0.5` 时预选
   分类下拉框并展示 reason 一行小字；用户改选后不再覆盖。
4. 请求去抖 + 同内容 hash 去重（前端 memo，省调用）。
5. **验收**：10 篇现有文档正文喂端点，≥8 命中真实顶层目录；断网/超时
   场景表单行为与现在完全一致；连打 11 次 429。
6. issue 收尾：留言说明"格式自动优化"拆分为独立 issue（editor 侧
   markdown lint 提示），本 issue 只交付分类。

工作量：1.5 天。风险：GLM 免费模型的结构化输出稳定性——`generateObject`
失败时 catch 后返回 `confidence: 0`（= 前端不预填），天然降级。

---

## F. #46 每日 Trending

**决策门（先贴 issue 等维护者选边，勿直接开工）**：
选项 1 = 自动抓取每日发布（issue 原意）；选项 2 = /feed 人工投稿已覆盖，
close。反对自动化的两个理由已在 triage doc（内容浓度稀释、版权与质量
无人背书）；支持的理由是冷启动内容供给。

**若选 1，最小可信架构**：

1. 抓取器 `scripts/fetch-trending.mjs`：源限定 GitHub Trending
   （官方页面无 API，用 HTML 解析，礼貌频率）+ Hacker News AI 关键词
   过滤（官方 Firebase API，稳定）。**不抓小红书/知乎/微信**——反爬
   与版权都过不了。
2. GitHub Action cron（每日 UTC 22:00 = 悉尼早 8 点）：抓取 → 生成
   markdown 草稿 → **开 PR 而不是直接发布**（#151 评论区共识的"草稿
   + 人工审核"，机制上强制而不是靠自觉）。
3. 人 merge PR → 内容进 `/feed` links tab 的数据源（复用现有
   `SharedLinkView` 结构，需确认 links 数据的落库路径——SSR 拉的是
   后端 API，则草稿 PR 改为向后端提交的 seed 脚本，此处执行时按实际
   数据流调整）。
4. 验收：连续 3 天 cron 产出 PR、内容可读、merge 后 feed 可见；停跑
   = revert workflow 一个文件。

工作量：2 天。**若 14 天无人认领审核职责，自动关闭该方向**——没有
人审的自动内容管道是负资产。

---

## G. #169 + #163 内容目录

统一模式（每个 issue 一个 PR）：

1. **#169 学术写作/LaTeX**：新建 `content/docs/learn/cs/academic-writing/`
   ——`index.mdx`（导航页：路径总览 + issue 里 5 个视频资源的一句话
   点评导航）+ `latex-basics.mdx`（入门正文）+ `overleaf-workflow.mdx`。
2. **#163 Prompts/AI 技巧**：扩充现有 `content/docs/learn/ai/tools/`
   （不另起目录）——`prompt-collections.mdx`（收录 issue 里的仓库，
   **剔除 bypass-paywalls 并在 PR 描述说明理由**：绕过付费墙与社区
   合规底线冲突）+ `ai-coding-tips.mdx`。
3. 每篇 frontmatter：`title`/`description`（过 `check:frontmatter`）/
   `docId`（`pnpm docs:sync-cuid` 生成）。
4. 中文撰写；`.en.mdx` 不手工写，挂翻译流水线（盲点分析文档）统一
   产出，PR 描述注明。
5. 验收：`pnpm build` 通过、sidebar 出现、双 locale 可访问（en 走
   fallback 提示属预期）；issue close 留言链接上线页面。

工作量：各半天到一天（主要是内容编写）。

---

## H. #319 LeetCode 游戏化（Growth Engine）

### 架构决策及理由

- **通用 Growth Engine + vertical 插件**（维护者 2026-05 评论已定调）。
  核心抽象：`xp_events` 是唯一事实源（append-only 事件溯源），等级/
  成就/排行全部是事件流的物化视图——**任何"直接改余额"的设计都拒绝**，
  否则防刷、审计、重算都做不了。
- **表挂 Sa-Token 用户体系**（全局约束 1）：`user_id BigInt` 引用
  `user_accounts`。经确认 NextAuth 表已冻结，别碰。
- **数据获取用公开 GraphQL 查公开数据，绝不收用户凭据**——LeetCode
  没有官方 API，`leetcode.com/graphql` 与 `leetcode.cn/graphql` 是
  逆向端点（schema 不同，两套适配器），只查公开 profile/提交统计。
  用户在 `/settings` 填用户名即绑定。**风险声明**：端点可能变更/加
  验证码，适配器要接口化 + 失败降级（显示"同步暂不可用"而非报错）。
- **同步走 GitHub Action cron 批量**，不做访问时实时拉取（Vercel CPU
  红线 + 对 LeetCode 礼貌）。每日一次，全量绑定用户串行同步，速率
  ≤ 1 req/2s。

### 分期实施

**P0 设计 PR（必须先行，1 天）**：`dev_docs/growth-engine-design.md`
落定 schema 与规则，评审通过才写码：

```
growth_bindings(user_id BigInt, vertical, external_id, verified_at)
xp_events(id, user_id, vertical, event_type, external_key UNIQUE, xp, occurred_at, synced_at)
-- external_key 例: "leetcode:AC:two-sum" —— UNIQUE 约束在 DB 层根绝重复计分
achievements(id, user_id, key, unlocked_at)
```

XP 规则（issue 原文数值起步）：Easy+10 / Medium+30 / Hard+50，首 AC
计分（external_key 唯一性保证）；连击加成放 P2 再议（规则引擎留接口，
首版写死映射表）。皮肤 = 等级区间 → 主题文案表的纯前端映射（修仙/
军衔/西幻各一张 JSON），不进 DB。

**P1 绑定与同步（3 天）**：settings 页加绑定表单（校验用户名存在——
调一次 profile 查询）；`scripts/sync-leetcode.mjs` + cron workflow；
`xp_events` 落库。验收：绑定后次日看到自己最近 AC 记录换算的 XP 事件，
重复跑同步零新增事件。

**P2 展示（2 天）**：`/u/[username]` 个人页加 XP/等级/成就区块（SSG +
ISR，别 dynamic）；`/rank` 加 XP 榜 tab（复用 leaderboard 静态生成
模式：cron 里顺手产 JSON，前端纯静态读）。验收：build 表 diff 无
路由回退。

**P3 可视化与皮肤（2 天）**：贡献热力图（有现成 leaderboard 热力图
可参考风格）、难度饼图、主题切换。

### 风险清单

- GraphQL 端点失效：适配器隔离 + 降级文案（上面已述）。
- 刷分（伪造用户名绑定他人账号蹭 XP）：绑定即公开数据，XP 也是公开
  数据的换算，无经济价值，接受；若未来接奖励再加所有权验证（profile
  简介贴验证码）。
- leetcode.cn 合规：只读公开数据、低频、可随时下线该适配器。

---

## I. #207 careerCoach Multiagent

**现状**：构想（LLM compiler + ReAct + 4 persona agent），评论区一针见
血指出缺 JD 数据源。**架构师判断：数据先于 agent——没有 JD 语料，4 个
persona 只是 4 个提示词皮肤。**

**决策门（贴 issue）**：Q1 JD 从哪来（用户手动粘贴 / 公开数据集 /
爬取——爬取有 ToS 风险需明确否决或承担）？Q2 交付形态（站内页 or
独立项目）？

**若走最小站内版（用户粘贴 JD，规避全部数据风险，共 4-5 天）**：

1. P0：单 agent 版——新页 `/[locale]/career-coach`（SSG 壳 + 客户端
   交互），用户粘贴 JD + 选背景（PR 程序员/移民/博士/大厂 四选一即
   四个 system persona），走现有 `/api/chat` 基建（限流/BYO-key 全
   复用），输出结构化建议（路线打分 + 理由——issue 里两个输出形态
   之争用"打分+讲解"落地，因为它可结构化可对比）。
2. P1：多 persona 并行对比视图（同一 JD 四个 persona 各给一份，前端
   并排）——这已覆盖"multiagent"的用户价值，**不需要 LLM compiler
   编排框架**；框架是手段不是需求，除非 P1 被证明不够。
3. 验收：3 份真实 JD 输出可读的差异化建议；无新后端、无新密钥。

若维护者坚持完整 multiagent 编排：先在 issue 里回答"P1 的并排输出
缺了什么、编排解决什么具体问题"，答不出就停在 P1。

---

## J. #151 小红书自动化

**架构师判断：这是运营项目不是代码项目，代码是最容易的 20%。**
硬依赖（缺一即搁置）：真实小红书账号及其交接机制、内容审核责任人、
平台自动化发布的 ToS 风险承担决策。

**决策门（贴 issue）**：谁持有账号？谁做人审？接受第三方非官方发布
工具的封号风险吗？

**若三问有答案，管道设计（独立仓库，不进主站，2-3 天）**：

1. 选题：`generate-leaderboard` 已产出热门文档数据 → 每周 top 文档
   作为改写素材（**只用自家内容，零版权风险**——比 issue 里"抓取
   热门笔记再创作"干净得多，后者直接否决）。
2. 生成：LLM 把文档改写成小红书体草稿（标题 + 封面文案 + 正文 +
   标签），存 markdown 到独立 repo，PR 形式提交。
3. **发布永远人工**：审核人 merge PR = 批准，然后手动贴到小红书。
   不接任何非官方自动发布 API——封号风险 + ToS 风险不值得。
   （richardkkk 评论的"草稿 + 人审"是共识，此设计把它做成机制。）
4. 数据回流（P2 可选）：UTM 参数 + Umami 看引流效果，人工周报。

---

## K. #43 Website2Agent（Paper2Agent 衍生）

**架构师判断**：Paper2Agent 的本质是"仓库 → MCP 工具集"。对本站，
等价物是"**文档站 → MCP server**"——而 #366 的维护者回复透露站点
已有 web-mcp 方向。**先盘点已有 MCP 能力再谈新框架，否则就是重造。**

1. 侦察（半天）：找到维护者所指的 web-mcp 实现（另一 repo 或部署），
   列出已暴露的 tool 清单。
2. 决策门（贴 issue）：Website2Agent 相对现有 web-mcp 的增量是什么？
   若答案是"把文档内容变成可调用知识"→ 那就是 RAG v2（计划 D）的
   MCP 封装——**合并进 RAG v2 的 P3 之后做一个 `search_docs` MCP
   tool，本 issue 关闭指向之**。
3. 若维护者想要的是"对任意论文/网站生成 agent"的通用框架 → 超出主站
   scope，建议独立孵化仓库，主站只留链接（footer 生态位模式，参照
   eade8e6 的 IH 生态栏先例）。

---

## L. #34 Amadeus 伴学助手

**架构师判断**：语音伴学（ASR + TTS + 视觉 + 长期记忆）与文档站的
运行时约束（Vercel serverless、Hobby CPU 红线）完全不兼容——**不应
进主站**。两条出路贴 issue 供选：

1. **生态位模式（推荐）**：作为独立项目在社区孵化（issue 里已有两个
   可拼装的开源参考），主站 footer 生态栏 + 一篇 `projects/` 文档
   介绍接入。主站工作量：一篇文档 + 一个链接，半天。
2. **降级借鉴模式**：把"伴学"里可 serverless 化的一小块——学习打卡
   提醒 / 基于 Growth Engine（计划 H）事件流的每周学习报告——并入
   H 的 P3 之后规划，语音/视觉部分明确放弃。
3. 30 天无人认领独立项目 → close as not planned（可 reopen）。

---

## 执行顺序建议（考虑依赖与复用）

```
立即可做（无依赖）：A1 → A3 → C(#69) → G(#169/#163) → B(#129)
第二波（互有复用）：E(#94, 顺手重构 rate-limit 工厂)
                  → D-P1(RAG 索引层, 顺手抽 lib/mdx-segment.ts
                    ——翻译流水线 Phase 1 复用同一模块)
                  → D-P2/P3
第三波（先设计评审）：H-P0 → H-P1..P3
决策门等待区：F(#46) / I(#207) / J(#151) / K(#43) / L(#34)
持续跟踪：A2(#297 backend PR)
```

两个跨计划的公共模块顺序敏感，先到先建，后者复用：
`lib/mdx-segment.ts`（remark heading 分块，翻译流水线与 RAG 共用）、
`createLimiter` 工厂（#94 与 RAG retrieve 共用）。
