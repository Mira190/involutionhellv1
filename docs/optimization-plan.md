# 综合优化计划（2026-08-07，实测驱动）

上游状态：`upstream/main = 4cc1055`，相对集成基线**新增 0 commit**，无需
rebase。本计划的每一条都附本轮实测数据；没有数据支撑的条目一律标注为
"未验证"，不进入执行序列。

---

## 零、本轮实测推翻的两个既有判断（先纠错再排序）

### A. "87 个 fence-integrity error 是历史机翻把代码注释译成英文"——**部分错**

逐 fence 分类实测（120 对 zh/en，`extractFences` 逐块比对）：

| 类别 | 数量 | 判定 |
| --- | --- | --- |
| 注释被翻译（`//` `#` `--`） | 56 | 良性，对英文读者是改善 |
| 示意性 fence（json/text，内含自然语言占位符如 `<完整上下文>`） | 16 | **翻译是改善**，字节等同门禁会禁止一次正当改进 |
| 可执行语言 fence 内容有差异 | 14 | 见下 |

对这 14 条逐条抽检后**全部证伪为假阳性**：
- `bash`/`sh` fence 里作者用 `//` 写注释（对 bash 非法但属示意写法），
  按语言选注释符的剥离器认不出 → 误判为代码差异；
- 唯一的 `python` 差异是 `'⬜'` vs `'⬜'`——同一字符的转义 vs 字面量，
  Python 语义完全相同。

**结论：语料里没有一处真实的代码损坏。** 87 条全部是良性差异。这同时
推翻了我上一轮的中间结论（"18 个文件有真实代码差异"）。

### B. "related-docs 可能大量文档 0 推荐"——**证伪**

实测 142 篇 zh 文档：83% 至少有 1 条推荐，均值 2.75，78 篇拿满 4 条，
仅 17%（24 篇）为 0。原定"覆盖率 <60% 就加标题 token 重合"的补救**不必做**。
零推荐几乎全部落在 32% 无 tags 的文档上——**这是内容问题不是算法问题**。

---

## 一、执行序列（按 价值/成本 排序）

### ✅ P0-1 fence 门禁按语言分级 —— **已实施（本轮）**

- **问题**：当前 fence 门禁要求字节等同，导致 87 条 error 长期挂红；
  照它"清零"会把英文注释改回中文、把示意性 JSON 的英文占位符改回中文，
  **负价值**。
- **证据**：上文分类表；14 条"代码差异"逐条证伪。
- **层次**：门禁层（`lib/translation-quality.ts`）。语料无需改动。
- **最简方案**：三级判定——
  1. 可执行语言 fence，**剥离注释后**（按语言选注释符，且额外容忍
     `//` 出现在 shell 类 fence 里）仍不等 → `error`；
  2. 剥离后相等（纯注释差异）→ `info`，标 `translated-comments`；
  3. 非可执行 fence（json/yaml/text/无 info）→ 不判等，只在**结构**
     （fence 数量、info string）不一致时 error。
  另加 Unicode 归一化（NFC + 转义序列展开）再比较。
- **回归风险**：真代码被改而门禁放行。缓解：保留"剥离注释后必须等"的
  硬判定，只放宽注释与非可执行 fence。
- **实测结果**：全语料 error **103 → 17**，info 68，warning 8 不变。
  fence-integrity 87 error → **1 error + 68 info**。剩下那 1 条是
  "fence 数量 7 vs 12"的结构性差异，属门禁应当拦住的真问题，保留为 error。
- **实施中发现并修掉的两个自身 bug**：
  1. 宽松注释剥离会把 C/C++ 预处理指令 `#include <vector>` 当成注释整行剥掉，
     导致 `#include <向量>` 这类真事故被判等放行——已加预处理关键字负向断言，
     并有回归测试锁住；
  2. 含 CJK 的 `<占位符>` 归一必须只在**源侧含 CJK**时启用，否则会连
     `#include <vector>` 一起放行。
- **证伪条件**：若改造后仍有可执行 fence 差异无法归入上述任一良性类，
  则语料确有代码损坏，应回到严格门禁并人工修复该文件。

### P0-2 `generated/doc-dates.json` 退出 git（根治，而非继续豁免）

- **问题**：它由 `git log` 推导，任何新 commit 都会改变它 → 任何
  "build 后工作树必须干净"的门禁在构造上不可满足（已实测：干净树
  build 后必脏）。当前用"门禁排除该文件"止血，但它仍是每个 PR 的
  伪冲突源（两人各自 build 就冲突）。
- **证据**：本轮实测 + remediation 分支上的 1 条日期漂移（08-03→08-06，
  由前一个 commit 触碰该文件所致）。
- **层次**：构建产物治理层。
- **最简方案**：从 git 移除 + `.gitignore`；`prebuild` 已生成，另把
  `dev` 脚本前置同一生成步骤（`pnpm dev` 覆盖绝大多数贡献者）；
  页面 import 改为**容错**（文件缺失时不显示"最后更新"而不是 build 挂）。
- **回归风险**：直接跑 `next dev`（不经 pnpm 脚本）的人看不到更新时间。
  可接受，且容错 import 保证不报错。
- **度量**：门禁恢复为无豁免的 `git status --porcelain` 全量检查；
  PR 冲突面减少 1 个文件。
- **证伪条件**：若容错 import 在 SSG 下导致 hydration 或类型问题，改回
  committed + 豁免方案。

### P1-1 锚点钉扎（仍是全生态空白 + 解对齐脆弱）

- **问题**：翻译改变 heading 文本 → 锚点 slug 变 → 跨语言深链断；
  且三方对齐按**位置**，人为增删章节即整篇跳过（实测 7 篇 unalignable）。
- **证据**：Phase 1 实测 7 篇；微软 co-op-translator 生产事故清单同款。
- **层次**：内容 + 分段层。
- **最简方案**：codemod 给 zh 原文 heading 注入 `[#<现有 slug>]`（值取
  今天 github-slugger 的输出 → **URL 零变化**）；`segmentMdx` 解析显式
  id；对齐键从"位置"改为 id。
- **回归风险**：codemod 误伤代码块内 `#`；用 fence-aware 分段规避（已有）。
- **度量**：unalignable 文档 7 → 0；跨语言锚点链接 100% 可解析
  （质量门禁的 internal-link 规则可直接验证）。
- **证伪条件**：若 7 篇不齐的根因是整章缺失而非位置漂移，则钉扎无助，
  应转为人工补译。

### P1-2 翻译成本三件套（Batches + 缓存前缀 + glossary）

- **问题**：默认逐条 Messages 调用、无 batch、system prompt 未设计为
  可缓存前缀、无术语表。
- **证据**：`grep batch = 0`、`grep glossar = 0`；研究结论：Batches 五折、
  cache 读 ≈0.1×、WMT25 证明 glossary 注入对术语准确率是因果提升。
- **层次**：provider 层（局部）。
- **最简方案**：≥50 单元的 APPLY 走 Message Batches；system prompt 拆
  「固定前缀（含 glossary）+ 文档内容」两段；glossary 初版从已 adopt 的
  1513 条 TM 里挖高频术语对生成。
- **度量**：单次全量重翻成本（当前 183 单元不敏感，全量重翻时对比
  list price vs batched）；术语一致性由质量门禁新增的 glossary 合规规则统计。
- **注意**：缓存前缀需 ≥2048 token 才生效，glossary 太短会静默不缓存。
- **证伪条件**：若 glossary 注入后术语违规数不降反升（模型被过度约束），
  回退为仅检查不注入。

### P2 运行时/CPU（Vercel Hobby 红线）

实测集成分支路由表：**20 条 ƒ Dynamic**，其中 7 条是 `/admin/*`（登录后台，
天然动态，无需优化）。真正值得看的是面向访客的 3 条：

| 路由 | 现状 | 建议 | 度量 |
| --- | --- | --- | --- |
| `/[locale]/rank` | ƒ | 数据源已是 build 时静态 JSON，理论可 SSG/ISR | build 表 ƒ→●/○ |
| `/[locale]/feed` | ƒ（已 revalidate 120） | 确认是否因某处动态 API 被钉死 | 同上 |
| `/[locale]/u/[username]` | ƒ | 保持动态（用户数据），但确保 bot 路径早返 | proxy.ts 已有 BOT_PATH_PATTERNS |

- **证伪条件**：若 `/rank` 因读 cookie 判断登录态而必须动态，则维持现状，
  改为在组件级切分（静态榜单 + 客户端登录态挂件）。

### P3 小额修正（各 <1 小时，可顺手做）

1. `classify` 降级路径按实例生命周期只 warn 一次（缺 key 时当前每请求一条，
   serverless 日志成本）——沿用 `rate-limit.ts` 的 `hasWarnedMissingUpstash` 模式。
2. 限流 fail-closed 用 `VERCEL_ENV` 区分 preview/production（当前
   `NODE_ENV==='production'` 会让 preview 也 fail-closed）。
3. TM GC：APPLY 尾部删除源段已不存在的条目（当前只进不出）。
4. `lib/doc-page-meta.ts` 与 `lib/doc-entry.ts` 的 `sanitizeSlugPath`/
   `docPathname` 是一对近义函数，合并留一个。
5. 无 tags 的 46 篇文档补 tags（直接提升 related-docs 覆盖率，内容工作）。

---

## 二、明确**不做**的事（避免下一轮重复提案）

- ❌ 按 fence 报告"修复"87 条 → 已证伪，会让文档变差。
- ❌ 给 related-docs 加标题 token 重合算法 → 83% 覆盖率不值得加复杂度；
  真瓶颈是 32% 文档没 tags。
- ❌ 降低 `MAX_TOKENS` 之外再做分块 → 实测最大 segment ≈3277 输入 token
  （输出约 5.2k），距 8000 上限有 1.5× 余量，0 条触顶。
- ❌ 把 en→zh 方向纳入长度比软门 → 语料占比 <7%，收益不抵噪音。

## 三、验收基线（做完 P0/P1 后应达到）

| 指标 | 当前实测 | 目标 |
| --- | --- | --- |
| 质量门禁 error（全语料） | 103 | ≈16（仅 heading-parity + residual-cjk） |
| build 后工作树 | 必脏 1 文件（已豁免） | 干净，无豁免 |
| unalignable 文档 | 7 | 0 |
| related-docs 零推荐 | 24 / 142 | <10（靠补 tags） |
| 测试 | 235 通过 | 保持全绿 + 新增门禁分级测试 |
