# 模拟签核登记（2026-07，翻译流水线 Phase 3/4）

本轮 Phase 3（治理）/ Phase 4（自动化）中，若干决策正常情况下需要维护者
签核或生产 secret。本次运行中这些签核为**模拟（MOCK）**：每条在此登记
决策内容、第一性原理复查、以及实际采取的动作。代码里只有当"代码行为本身
内嵌了模拟决策"时才带 `MOCK:` 注释；本文件是唯一的完整清单。

`MOCK:` 注释位置一览：

- `lib/contribution-credit.ts` — 翻译文件贡献计分规则（条目 b）
- `.github/workflows/translate-docs.yml` — secret 假定已 provision（条目 e）

---

## a. 存量语料 119 个质检 error 记为已知债务；CI 只对改动文件 strict

**决策（模拟）**：`pnpm check:translations:quality` 全仓 119 error（本轮
frontmatter 修复后降到 103）不阻塞 CI；CI 只对 PR 改动到的翻译对 strict。

**第一性原理复查**：

- 什么情况下这是错的？如果错误在存量里持续增殖（新 PR 也在产生同类错误
  却不被拦截），changed-only 就是漏斗。但 changed-only + strict 恰好拦截
  "PR 碰到的对"里的新错误，增量是被门住的；存量只会单调递减。
- 支持默认选择的证据：119 个 error 分布在 49 对文档里，绝大多数是 2026-04
  批量机翻的历史产物（fence 内容被翻译 87 个、标题结构漂移 8 个、残留中文
  8 个）。全仓 strict 会让每个碰 docs 的无关 PR 都红，作者没有能力也没有
  义务修别人的历史债，结果只会是集体忽略红色 CI——门禁信誉破产比没有门禁
  更糟。
- 证伪条件：如果观测到"未被 PR 碰到的对"error 数上升（即门禁外仍有错误
  流入，比如直接 push），该策略失效，需要改为全仓 strict + 一次性清债。

**退出条件**：全仓 error 清零后，把 `translation-quality.yml` 的
changed-only 翻转为全仓 `--strict`，防止债务复发。

**动作**：维持已上线设计，无代码改动；本文件登记。

## b. 人工修复翻译文件计入贡献者统计（细化规则）

**决策（模拟）**：翻译文件（frontmatter 带 `translatedFrom`）不再整体排除
出贡献统计；单个 commit 满足以下全部条件才计分：(i) 作者不是 bot
（login/name 含 `[bot]` 即排除）；(ii) 不是该文件的创建 commit；(iii)
commit subject 不含流水线标记 `[translation-sync]`。非翻译文件规则不变。

**第一性原理复查**：

- 天真规则的陷阱：如果只是"取消跳过、统计所有非 bot commit"，那么把
  2026-04/05 机翻批量产物一次性 commit 进仓库的人（#330 的批量提交者，
  约 120 个 `.en` 文件；另外 32 个由 github-actions[bot] 提交）会被追溯
  授予 ~152 个文件的"翻译贡献"——但翻译是模型做的，提交者只是搬运。
  这正是排除"文件创建 commit"的原因：批量导入的创建即全部内容。
- (iii) 的必要性：未来流水线以人类身份（或维护者本地）跑 `APPLY=1` 再
  commit 时，(i)(ii) 都拦不住，所以流水线 commit 统一带
  `[translation-sync]` 标记并按标记排除。workflow 与使用文档已同步该约定。
- 已知误伤面：真人如果**手工从零写**了一个 `.en` 文件（不是流水线产物），
  其创建 commit 也不计分——损失一次计数，但换来规则简单、不需要逐 commit
  人工裁决；后续修订仍正常计分。可接受。
- 创建 commit 的判定：GitHub commits API 按路径查询、时间倒序分页，取该
  路径最早的 commit 视为创建 commit。文件删除后重建会误判（重建 commit
  不是最早那条），当前语料无此情况；若出现，误差方向是"多计一次"，与
  历史行为一致。
- 证伪条件：如果发现有人靠机器批量修改翻译文件刷分（绕过三个条件），
  规则需要加内容 diff 权重；目前 PR review 流程足以拦截。

**动作**：规则抽为纯函数 `shouldCountTranslationCommit`
（`lib/contribution-credit.ts`，带 `MOCK:` 注释 + 单测覆盖 bot/创建/标记/
正常人工四类），`scripts/backfill-contributors.mjs` 翻译路径的 commit 先
过滤再聚合。脚本未实际运行（需要 GitHub API 与数据库）。**规则生效前需
维护者批准。**

## c. 跨语言合并搜索（2026-04 决策）正式废弃

**决策（模拟）**：不再实现"zh/en 合并为单一搜索索引"的 2026-04 遗留设想，
正式记录废弃，而不是让它无声烂尾。

**第一性原理复查**：

- 什么情况下废弃是错的？如果大量用户在 en 界面搜中文关键词（或反之）且
  得不到结果。但现状是 zh 文档本身重度中英夹写（术语、代码标识符、专有
  名词都是英文），zh 的 Orama 分片对英文关键词天然可命中；en 分片同理。
  关键词层面的跨语言需求已被语料特性覆盖大半。
- 真正的跨语言语义检索（"用中文问，命中英文段落"）是 embedding 召回问题，
  属于未来 RAG 层的职责，不该在关键词索引层硬做（合并索引会带来 tokenizer
  冲突、去重、排序权重三类新问题，收益却只剩语义场景）。
- 正式废弃优于沉默失效：登记后，后来者不会误以为这是"还没做完的功能"而
  重启半吊子实现。
- 证伪条件：搜索日志显示跨语言查询失败率显著（例如 en 用户大量输入纯中文
  查询且零结果占比高），届时在 RAG 层立项。

**动作**：仅本文件登记，零代码。

## d. Giscus 评论 zh/en 线程保持统一

**决策（模拟）**：同一文档的中英两个页面共用同一个评论线程。

**验证**：已在代码中确认满足，零改动——`app/components/GiscusComments.tsx`
在 docId 存在时用 `mapping="specific"` + `term={docId}`；`.en` 文件与源
文件共享同一 `docId`（质检门 `frontmatter` 规则强制 docId 一致），因此
两个 locale 页面映射到同一 discussion。仅当 docId 缺失时才退回 pathname
映射（此时会分线程，但缺 docId 本身是待修数据问题）。

**第一性原理复查**：分线程的好处是各语言讨论纯净，但本社区读者主体是
中文用户，en 页面评论量预期极低，分线程只会让 en 页面呈现"零评论"的
冷启动观感；统一线程让翻译页继承原页的讨论热度。错误条件：如果未来 en
读者群体形成规模且抱怨中文评论刷屏，再评估按 locale 分 category。

**动作**：零代码，登记为已满足。

## e. ANTHROPIC_API_KEY secret 已存在且自动翻译获批

**决策（模拟）**：假定仓库 secrets 已配好 `ANTHROPIC_API_KEY`，且维护者
批准每周自动增量翻译 + bot 直接 push。

**第一性原理复查**：

- 这两个假设都无法在本环境验证（secret 是生产资源，批准是人的决定），
  所以 workflow 必须在假设不成立时零伤害：secret 为空 → 打印明确原因、
  exit 0，不产生失败噪音也不产生任何写操作。批准撤回 → 关 workflow 或
  删 secret 即停。
- 直接 push 而非开 PR：翻译输出已有三道机器门（placeholder 校验、
  changed-only strict 质检、三方保护不覆盖人工文本），且 commit 带
  `[skip ci]` 与 `[translation-sync]` 标记可审计可 revert；每周一个 PR
  的人工 review 成本会让维护者疲劳并最终 rubber-stamp，不如把人力留给
  冲突报告。
- 已知风险：APPLY 运行如果写到的翻译对里**存量**就有 legacy error（比如
  残留中文），changed-only strict 门会把整次运行拦下（不 commit 任何
  文件）。这是有意的保守取向——bot 不该往已知有病的对里继续堆输出；
  解法是人工修掉该对的存量错误或加 `allowCjk` 豁免后重跑。
- 证伪条件：如果 bot 输出连续多周被门拦住，说明 legacy 债务和增量翻译
  耦合过紧，届时考虑把门的粒度细化到"仅 bot 本次写入的段"。

**动作**：`.github/workflows/translate-docs.yml` 上线，secret 门控 +
`MOCK:` 注释；`TRANSLATE_MAX_UNITS`（仓库变量，默认 200）限制单次调用量。

## f. 归属（attribution）frontmatter 补齐措辞获批

**决策（模拟）**：存量 `.en` 文件补齐机器可验证的来源字段：`lang: en`、
`translatedFrom: zh`、`sourcePath`（源文件可解析时）。**面向读者的可见
MT 声明（"本文由机器翻译"横幅类）推迟到 UI 层**（未来在 LicenseNotice
组件上加，不在本轮）。

**第一性原理复查**：

- 为什么 frontmatter 先行、UI 后行：frontmatter 是数据层，补齐后 UI 想
  怎么呈现都有据可依（`translatedFrom` + `translatorAgent` 已足够渲染
  声明）；反过来先做 UI 会在 8 个缺字段文件上无数据可渲。数据先于呈现。
- 为什么不顺手加 `translatedAt` 等字段：时间戳在本仓库不可信（Phase 1
  已定：过期判断只看 hash），多加字段只会制造第二事实来源。
- 措辞风险本身：frontmatter 字段无用户可见措辞，真正需要维护者审的是
  未来 UI 文案——那部分并未在本轮模拟通过，只是推迟。
- 证伪条件：如果法务/许可要求（CC BY-NC-SA 的演绎标注）被解读为必须立即
  可见声明，则 UI 层工作需提前。

**动作**：`scripts/backfill-translation-frontmatter.mjs` 行级手术补齐并
实跑：152 个 `.en` 文件中 8 个补 `lang`+`translatedFrom`、120 个补
`sourcePath`（32 个孤儿翻译无可解析源，不动）；幂等（二跑零 diff）；
质检 frontmatter 规则 error 16 → 0（全仓 119 → 103）。内容改动独立成
commit。

## g. 全量 APPLY 前的 5 篇抽样质量评审通过

**决策（模拟）**：抽样评审视为通过。

**第一性原理复查**：抽样评审的对象是**模型翻译产出**，没有真实 API key
就没有产出可评——模拟"通过"不能创造证据。所以本轮实际执行的"go"步骤是
**不需要 key 的那一半**：`ADOPT_ONLY=1` 把存量 `.en` 译文收编进翻译记忆
（1696 单元中 1513 段 adopted、零 provider 调用、两次运行字节级一致；
7 篇段数无法对齐者记 `(document)` 冲突待人工）。剩余 183 个待译单元
**保持 pending**，等真实 key 到位、真实抽样评审通过后由 workflow 增量
消化（首次消化受 `TRANSLATE_MAX_UNITS` 预算约束）。

顺带发现并修复：同轮存在重复 `docId` 的源文件（leetcode 两组重名文档）
会互相覆盖 TM 桶并制造 ~30 条伪冲突，已改为重复 docId 按路径分桶
（`scripts/translate-docs.mjs`），收编数从 1472 恢复到 1513，冲突报告
恢复确定性。

**动作**：TM 收编实跑并 commit；抽样评审在拿到真实 key 后必须真实执行，
本条模拟不豁免它。
