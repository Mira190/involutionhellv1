# Issue 全量 Triage 与未解决项执行计划（2026-07 快照）

> 目的：对 `InvolutionHell/involutionhell` 全部 **17 个 open issue** 做逐一核查——
> 是否已被代码解决、是否过时、还剩什么——并给每个未解决项写出**另一个 agent
> 可以直接照做的 step-by-step 执行计划**（handoff 文档）。
>
> 核查方法：逐 issue 读正文 + 全部评论，再在当前 main（frontend
> `eade8e6`）里 grep / 读码验证实际状态。所有"已解决/未解决"的判定都附代码证据，
> 不凭印象。

---

## 0. 总览表

| # | 标题（缩写） | 判定 | 建议动作 |
| --- | --- | --- | --- |
| [#366](https://github.com/InvolutionHell/involutionhell/issues/366) | x402 micropayments 推销 | **Spam** | 直接 close（维护者 2026-07-18 已留言宣布关闭，但 issue 仍 open） |
| [#297](https://github.com/InvolutionHell/involutionhell/issues/297) | Java stream 端点绕过限流 | **修复 PR 已开，待合并** | 跟踪 backend PR #41 合并后 close |
| [#129](https://github.com/InvolutionHell/involutionhell/issues/129) | 图床优化（R2） | **一半已解决** | editor 上传已走 R2；剩 CI 仓库图片迁移，见计划 A |
| [#69](https://github.com/InvolutionHell/involutionhell/issues/69) | TOC 锚点导航加章节号 | **未解决，可直接做** | 小型前端任务，见计划 B |
| [#39](https://github.com/InvolutionHell/involutionhell/issues/39) [#40](https://github.com/InvolutionHell/involutionhell/issues/40) [#41](https://github.com/InvolutionHell/involutionhell/issues/41) | RAG MVP（方案/数据/查询） | **过时，技术选型已被现实超越** | 合并重开一个 RAG v2 issue，见计划 C |
| [#94](https://github.com/InvolutionHell/involutionhell/issues/94) | 投稿 AI 自动分类 | **未解决，可直接做** | 复用现有 AI 基建，见计划 D |
| [#46](https://github.com/InvolutionHell/involutionhell/issues/46) | 每日 Trending 版块 | **未解决，需决策** | /feed 已部分覆盖，见计划 E |
| [#169](https://github.com/InvolutionHell/involutionhell/issues/169) | LaTeX / 学术写作文档目录 | **未解决，纯内容任务** | 见计划 F |
| [#163](https://github.com/InvolutionHell/involutionhell/issues/163) | Prompts 收集 + AI 工具技巧目录 | **未解决，纯内容任务** | 见计划 F（同一模式） |
| [#101](https://github.com/InvolutionHell/involutionhell/issues/101) | 重点施工文档方向（元 issue） | **大半已落地，伞形 issue 失效** | 建议 close 或转 project board |
| [#319](https://github.com/InvolutionHell/involutionhell/issues/319) | LeetCode 刷题游戏化 | **未解决，大型特性，需先设计** | 见计划 G（分期） |
| [#207](https://github.com/InvolutionHell/involutionhell/issues/207) | careerCoach multiagent | **未解决，停留在构想** | 需产品决策，见 §4 |
| [#151](https://github.com/InvolutionHell/involutionhell/issues/151) | 小红书官方号自动化 | **未解决，依赖账号运营** | 需人工决策，见 §4 |
| [#43](https://github.com/InvolutionHell/involutionhell/issues/43) | Paper2Agent / Website2Agent | **未解决，停留在构想** | 需产品决策，见 §4 |
| [#34](https://github.com/InvolutionHell/involutionhell/issues/34) | Amadeus 伴学语音助手 | **未解决，停留在构想** | 需产品决策，见 §4 |

行动优先级建议（可并行）：**#366 close → #297 跟 PR → 计划 B（半天）→
计划 A（1 天）→ 计划 D（1-2 天）→ 计划 C（重开 issue 后分期）**。
内容类（计划 F）随时可做；大型特性（G）先出设计再动工。

---

## 1. 已解决 / 即将解决的 issue（只差收尾动作）

### #366 — MCP 监付费推销（Spam）

- **证据**：发帖人 `scotia1973-bot`，推广外部付费服务。维护者 longsizhuo
  2026-07-12 回复 "this is web-mcp"，2026-07-18 又留言明确 "自动推销外链的
  spam……关闭"。但 API 显示 issue 状态仍是 OPEN。
- **收尾动作**（需要 triage 权限）：close as `not planned`，加 `spam` label。
  没有任何代码工作。

### #297 — Java `/openai/responses/stream` 绕过限流

- **演变**（评论区完整记录）：
  1. 原始报告：登录用户可 curl 后端直烧 OpenAI 付费额度（Java 层无限流）。
  2. 2026-04-16 复核：后端容器里 `OPENAI_API_KEY` 是过期 key，该路径**当前
     根本不通**——风险降级为"死代码路径"，backend PR #8 把默认值切到免费 GLM。
  3. **2026-07-18：修复 PR 已开** `involutionhell-backend#41`——Java 层每用户
     Caffeine 固定窗口限流（默认 10 req/min，`OPENAI_STREAM_RPM` 可调，超限
     429），SECURITY.md 增 INV-006 不变量 + 3 个回归测试。
- **前端仓库无需任何改动**（Next.js 侧限流已在 `lib/rate-limit.ts`，
  `app/api/chat/route.ts:44` 在用）。
- **收尾动作**：盯 backend PR #41 合并 → issue 按评论约定自动/手动 close。
  如果 PR 长期未合，把"merge backend#41"作为唯一待办提醒维护者即可。

### #101 — 重点施工文档方向（元 issue）

- **证据**：五个方向在 `content/docs/learn/ai/` 下都已有对应目录并有内容：
  Agent（`Introduction-of-Multi-agents-system/`、`agents-todo/`）、强化学习
  （`reinforcement-learning/`）、LLM 基础（`llm-basics/` 含 transformer /
  pytorch / cuda / embeddings）、论文复现（`papers/`）、面经（
  `foundation-models/qkv-interview/`）。
- **判定**：作为"方向宣言"已完成历史使命，不可能有一个 PR 能"关掉"它。
- **收尾动作**：留言总结现状后 close，或转成 GitHub Project board 的栏目。
  不建议留着——它会永远 open。

---

## 2. 部分解决：还剩一半的 issue

### #129 — 图床优化（Cloudflare R2）

**已解决的一半**（issue 正文第一句 + LynPtl 的上传服务设想）：

- `app/api/upload/route.ts` 已实现 R2 预签名上传：S3 兼容 API、
  `MAX_UPLOAD_BYTES` 大小上限绑进签名、`sanitizeResourceKey` 防路径穿越，
  服务于 editor / 投稿流程。密钥在服务端 env，未进仓库——LynPtl 最初担心的
  "开源仓库不能放密钥"已用这个方式解决。
- `content/docs/learn/cs/dev-tips/cloudflare-r2-sharex-free-image-hosting.mdx`
  还沉淀了一篇 ShareX + R2 的手动图床教程。

**未解决的一半**（2026-04-10 LynPtl 评论的 CI 方案，获维护者 👍）：
贡献者把图片放进仓库、CI merge 后自动上传 R2 并回写 URL。目前
`scripts/move-doc-images.mjs` 只做本地目录规整（`check-images.mjs` 只做
lint），没有任何 workflow 碰 R2。

**执行计划 A（CI 图片自动迁移，预估 1 天）**：

1. 新建 `scripts/migrate-images-to-r2.mjs`：
   - 扫 `content/docs/**/*.{md,mdx}`，解析出**相对路径**图片引用
     （复用 `check-images.mjs` 里现成的引用提取逻辑；远程 URL 跳过——
     issue 原文就是这么要求的）。
   - 对每张本地图：读文件 → `PutObjectCommand` 直传 R2（复用
     `app/api/upload/route.ts` 的 client 配置方式，key 规则建议
     `docs/<docId>/<filename>`，用 docId 保证文档改名后 URL 不变）→
     把 md 里的相对路径替换为 R2 公开 URL → `git rm` 原图。
   - 幂等：已是 R2 URL 的引用跳过；上传失败保留原引用并非零退出。
2. 新建 `.github/workflows/migrate-images.yml`：
   - 触发：`push` 到 main 且 `content/docs/**` 变更。
   - 跑上面脚本，有 diff 则 commit 回 main，**commit message 必须带
     `[skip ci]`**（LynPtl 评论明确要求，防死循环；参照现有
     `sync-uuid.yml` 的回写模式——它已经在做同类事情）。
   - Secrets：`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
     （与 Vercel 上 upload API 用的同一组，需在 GitHub repo secrets 补配）。
3. 验证：
   - 本地 `DRY_RUN=1` 跑脚本，确认替换 diff 正确、远程 URL 未被碰。
   - 用一篇带本地图的测试文档走完整 push → CI → 回写链路。
   - `pnpm build` 确认无 broken image（`lint:images` 通过）。
4. 注意事项：
   - 回写 commit 会触发 `backfill-contributors` 场景——workflow 用 bot 身份
     commit，排行榜已过滤 bot（`fix(rank) #363`），无污染风险，但要复核。
   - 图片删除是破坏性操作：首次全量迁移前先出 dry-run 报告贴 issue 让
     维护者确认，再执行。

---

## 3. 未解决且可以直接开工的 issue

### #69 — TOC 锚点导航加章节号（计划 B，预估半天）

- **现状证据**：`app/[locale]/docs/[...slug]/page.tsx:187` 直接用 fumadocs
  默认 `<DocsPage toc={page.data.toc}>`，仓库里没有任何自定义 TOC 组件；
  fumadocs-ui `15.7.13` 默认 TOC 不带编号。maintainer 曾指派 TSK-Glofy
  （2025-09），此后无动静。
- **步骤**：
  1. 首选 **纯 CSS 方案**（零 JS、不动组件树）：fumadocs TOC 渲染为嵌套
     列表，用 CSS counters 按 `depth` 加 `1.` / `1.1` 前缀。在全局样式里
     针对 `[data-toc]`（以 15.7.13 实际 DOM 为准，先在浏览器里确认选择器）
     写 counter 规则。
  2. 若 DOM 结构不支持稳定选择器，fallback：给 `DocsPage` 传自定义
     `toc={{ component: ... }}`（fumadocs-ui 支持 TOC 槽位替换），在自定义
     组件里遍历 `page.data.toc`（`TOCItemType[]`，自带 `depth`）生成编号。
     编号逻辑 ~20 行：维护一个 depth 计数栈。
  3. 注意：本站正文 heading 会被 `remarkShiftHeadingIfH1` 整树降级
     （`source.config.ts`），TOC 的 depth 已是降级后的值，编号从最浅层
     出现的 depth 起算，**不要硬编码 h2 起步**。
  4. 验证：找一篇层级深的文档（如 `learn/ai/multimodal/VQVAE/`）+ 一篇
     无 h1 文档对比看编号；zh / en 两个 locale 都要看（en 文档 heading
     文本不同但结构应一致）；`pnpm build` 确认无 hydration 告警。
- **验收**：TOC 呈 `1 / 1.1 / 1.1.1` 编号；不改变现有滚动高亮行为。

### #39 + #40 + #41 — RAG MVP 三连（计划 C：先重开 issue 再分期实施）

- **为什么判"过时"而不是"未做"**：三个 issue 是 2025-09 的技术选型
  （FastAPI + LlamaIndex + Pinecone + Cohere + Gemini），此后主站实际走了
  完全不同的路：
  - 搜索：静态 Orama 分片已上线（`app/search.zh.json/route.ts` +
    `search.en.json`，按 locale 分索引）——#39 里"替换效果不好的搜索"
    的动机已被部分消化。
  - AI 问答：`app/api/chat/route.ts` 已上线**页面上下文注入**式助手
    （读当前文档 MDX 塞 system prompt，GLM 免费模型 + BYO key，
    Upstash 限流）——不是向量检索，检索范围只有当前页。
  - 仓库里 **零** Pinecone / LlamaIndex / embedding 痕迹；Java 后端
    （另一个 repo）也已存在，"再起一个 FastAPI 服务"会是第三个后端。
- **残余的真实需求**：跨文档问答（"整个站里有没有讲 X 的文章？"）目前
  没有任何东西能回答；Orama 是关键词检索，中英分片互相看不见（用户
  2026-04 决策过要跨语言搜索，未实现）。
- **步骤**：
  1. **先做 issue 卫生**：在 #39 留言总结上面的现状，close #39/#40/#41
     （superseded），新开一个 "RAG v2" issue 引用本文档。**不要在旧选型
     上继续盖楼**——三个 issue 的技术栈没有一条与现状兼容。
  2. RAG v2 推荐架构（就地取材，不引入新服务商）：
     - 向量库：**pgvector on 现有 Postgres**（仓库已有 prisma +
       `prisma/`schema，加一张 `doc_chunks` 表即可；不引 Pinecone，
       少一个 SaaS 依赖和密钥面）。
     - 索引脚本：`scripts/build-doc-index.mjs`，build/CI 时按 heading
       分块（文档已有稳定 `docId`，chunk key = `docId#headingSlug`），
       内容哈希去重，只重嵌变更块。
     - Embedding：走现有 `@ai-sdk/*` 依赖已支持的 provider（Gemini
       embedding 免费额度即可，`lib/ai/models.ts` 已有 provider 抽象）。
     - 查询：给 `app/api/chat/route.ts` 加一个可选 `retrieve: true`
       分支——先向量检索 top-k chunk，再拼进现有 system prompt。限流、
       BYO-key、GLM fallback 全部复用，不新起服务。
     - zh/en：只索引原文（zh 为主），检索时不分语言——embedding 天然
       跨语言，顺带兑现"跨语言搜索"那条烂尾决策。
  3. 分期：P1 = 索引脚本 + 表结构 + 离线验证 top-k 质量（拿 20 个真实
     问题人工评）；P2 = chat 接入 + 前端开关；P3 = 用检索结果页替换/增强
     站内搜索（回收 #39 的原始动机）。
  4. 验收（P2）：问一个只有某篇冷门文档能答的问题，助手能引用到该文档
     并给出链接；Vercel 函数耗时不超现有 `maxDuration = 30`。

### #94 — 投稿 AI 自动分类（计划 D，预估 1-2 天）

- **现状证据**：投稿链路已存在——`app/[locale]/feed/submit/`（链接分享带
  `CategoryTabs` 人工选分类）、`app/[locale]/editor/`（原创文章）、
  `PromoteToDocsButton.tsx`（帖子转正式文档）。全链路 grep 不到任何
  AI 分类调用。issue 另一半"格式自动优化"同样无实现。
- **步骤**：
  1. 分类目标集 = `content/docs` 顶层目录树（用 `lib/source.ts` 的
     `source.getPageTree(locale)` 动态取，别硬编码——目录会变）。
  2. 新建 `app/api/classify/route.ts`：输入 title + 正文（截断 2k 字），
     用 `lib/ai/models.ts` 现有 `getModel()`（GLM 免费模型）+ 结构化输出
     （目录 slug + 置信度 + 一句理由）。**复用 `lib/rate-limit.ts` 限流**
     ——这是 #297 一役立下的规矩，任何新 AI 端点都必须带限流。
  3. 前端：submit / editor 表单在标题+正文填完后调用一次，把结果**预填**
     为默认选项，用户可改——AI 只做建议，不做最终决定（低置信度 <0.5
     时不预填，静默降级为现状人工选择；后端挂了同样静默降级）。
  4. "格式自动优化"（issue 的第二个愿望）单独拆出去：editor 已是 MDX
     编辑器，格式问题更适合用 lint 提示而不是 AI 重写正文——在本 issue
     留言说明拆分，避免 scope 悄悄膨胀。
  5. 验收：拿 10 篇现有文档的正文喂 classify 端点，命中它们真实所在
     顶层目录 ≥8 篇；限流生效（连打 >N 次返 429）。

### #46 — 每日 Trending 版块（计划 E，先决策后动工）

- **现状证据**：`/feed` 已上线"原创文章 + 分享链接"社区墙（
  `app/[locale]/feed/page.tsx`，revalidate 120s）——issue 里"增加站内
  干货内容"的目标被**人工投稿**部分覆盖；但"自动抓取热点、每日发布"
  （参考 ai-trend-publish）完全没做。
- **需要维护者先回答的问题**：还要不要**自动**抓取？两个理由说明这不是
  纯技术决定：(a) 自动内容会稀释社区原创内容的浓度，和 #151 评论区
  "AI 内容先草稿、人工审核再发布"的社区共识相悖；(b) 抓取源版权和
  内容质量需要人背书。
- **若决定做，最小方案**：GitHub Action 定时（cron）抓 1-2 个源
  （如 GitHub Trending / HN AI 区）→ 生成**草稿** PR（不是直接发布，
  遵循 #151 评论共识）→ 人工 review 合并后进 feed 的 links tab（数据
  结构现成）。不新增运行时服务，全部离线发生。
- **若决定不做**：留言说明 /feed 已覆盖目标后 close。

### #169 + #163 — 内容目录类（计划 F，模式相同，各半天）

- **现状证据**：#169 要的 LaTeX/Overleaf/学术写作路径——
  `find content/docs -iname "*latex*" -o -iname "*overleaf*"` 为空
  （只有 `dev-tips/Katex/` 两篇讲站内公式渲染的，不是学术写作教学）。
  #163 要的 prompts 收集/AI 工具技巧——只有 `learn/ai/papers/` 下一篇
  prompt 相关论文笔记，无收集目录。
- **通用步骤**（每个目录一个 PR）：
  1. 选位置：#169 → `content/docs/learn/cs/academic-writing/`（或
     `learn/` 下新顶层，让维护者选）；#163 → `content/docs/learn/ai/tools/`
     已存在，扩充它而不是另起炉灶。
  2. 每篇文档 frontmatter 必须齐：`title` / `description`（
     `check:frontmatter` CI 会拦缺失）/ `docId`（跑 `pnpm docs:sync-cuid`
     生成，别手编）。
  3. 内容来源：issue 正文里已列好 b 站/GitHub 资源清单，第一版就是把
     清单整理成带一句话点评的导航页 + 1-2 篇入门正文。**注意 #163 里的
     bypass-paywalls 项目涉及绕过付费墙，不要收录**——与社区合规底线
     冲突，留言说明剔除理由。
  4. 新文档 merge 后属于翻译盲区（`.en.mdx` 不会自动出现，站上英文
     locale 会 fallback 中文）——在 PR 描述里注明，等翻译流水线任务
     统一处理。
  5. 验收：`pnpm build` 通过；新页面在 sidebar 出现、双 locale 可访问。

### #319 — LeetCode 刷题游戏化（计划 G，大型特性，先设计后分期）

- **现状证据**：无任何实现。维护者 2026-05-04 评论已给出清晰的架构方向：
  **抽通用 Growth Engine（XP/等级/成就/皮肤），LeetCode 只是第一个
  vertical**，皮肤（修仙/军衔）做成主题层。
- **步骤**（严格分期，每期独立可验收）：
  1. **P0 设计 PR（必须先行）**：`dev_docs/growth-engine-design.md`——
     schema（`user_xp` / `xp_events` / `achievements` / 每 vertical 一张
     绑定表）、XP 规则引擎接口、防刷（同题重复提交不加分——issue 正文
     已定）、皮肤主题层接口。评审通过才进 P1。
  2. **P1 数据接入**：LeetCode GraphQL 拉取用户提交记录（issue 正文给了
     字段清单；leetcode.com 和 leetcode.cn 端点不同、graphql schema
     不同，要两套适配器）。绑定方式：用户在 /settings 填 LeetCode
     用户名（公开数据，无需密码/cookie——**不要**做任何需要用户交出
     凭据的方案）。定时同步走 GitHub Action cron 或按访问懒同步。
  3. **P2 XP/等级/成就**：纯后端规则 + `/u/[name]` 个人页展示（个人页
     路由已存在）。
  4. **P3 可视化/皮肤**：热力图、难度饼图；修仙/军衔主题文案表。
  5. 风险提示写进设计 PR：LeetCode 无官方公开 API，GraphQL 端点属于
     逆向使用，需评估失效风险和请求频率礼貌值；leetcode.cn 数据合规。
- **验收（P1）**：绑定用户名后能看到自己最近 20 条 AC 记录，重复同步
  不产生重复 XP 事件。

---

## 4. 停留在构想阶段、需要产品决策的 issue（#207 / #151 / #43 / #34）

这四个共同点：没有代码、没有设计文档、依赖外部账号或大量运营人力，
且评论区都只有一条初步讨论。**不建议任何 agent 直接开工**——先要维护者
回答关键问题：

| # | 卡在哪 | 最小决策问题 |
| --- | --- | --- |
| #207 careerCoach | 架构构想（LLM compiler + ReAct）无输入源 | 评论区已点破：先要"读取 JD 的东西"。做不做 JD 采集？数据从哪来？ |
| #151 小红书号 | 需要真实小红书账号 + 交接机制 + 内容审核流程 | 谁持有账号？评论共识"草稿+人工审核"由谁执行？ |
| #43 Website2Agent | Paper2Agent 的适配范围不明 | 是站内功能还是独立项目？先选 1 篇站内文档做 PoC？ |
| #34 Amadeus 伴学 | 纯外部开源项目拼装，与主站关系不明 | 是否属于主站 scope？还是放社区生态（footer 已有 IH 生态位）？ |

**建议的统一处理**：给每个留言附上以上决策问题 + 30 天无响应则打
`stale` label 并 close（可随时 reopen）。让 idea 类 issue 有生命周期，
而不是永远挂着。

---

## 5. Handoff 注意事项（给下一个执行 agent）

1. **动工前重读对应 issue 的最新评论**——本文档是 2026-07 快照，#297 这类
   "评论区已推翻正文"的情况随时可能再次发生。
2. 所有计划默认在 frontend 仓库 `InvolutionHell/involutionhell` 上做；
   #297 在 backend 仓库，本仓库无事可做。
3. 任何新 AI 端点必须带 `lib/rate-limit.ts` 限流（#297 的教训已成规矩）。
4. 涉及路由变更的 PR 按 CLAUDE.md 用 `pnpm build` 前后表 diff 验证 SSG
   不回退；涉及 `content/docs/career/interview-prep/leetcode/` 的 PR
   commit 前必须跑一次 `pnpm build` 同步 slug map。
5. close issue、打 label 属于仓库管理动作，需维护者或有权限的 bot 执行；
   本文档只给出建议话术和理由。
