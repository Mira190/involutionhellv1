# 事故报告 + 交接文档（2026-07-19）

> **给下一个执行者（人或更小的模型）**：读完本文即可在不重读全仓的情况下
> 继续工作。本文同时是一次数据丢失事故的完整记录。

## 一、事故：本 session 的 16 个分支从未到达真实 GitHub

**现象**：session 内所有 `git push` 都报告成功、`git ls-remote` 也能读回
分支——但它们只存在于 session 沙盒的本地 git 代理里。容器多次重启后，
代理与本地仓库快照被重置，**16 个分支（11 个 issue 实现分支 + 4 个
blindspot phase 分支 + 1 个 research 文档分支）的全部 commit 丢失**。
直连 GitHub 核对（87 个真实 heads）确认无一存在；本地 reflog 证明当前
目录是 session 初期的基础快照。

**根因链**：
1. push 经由 127.0.0.1 本地 git 代理，代理确认写入但从未（或未持续）
   向 github.com 同步；
2. 代理对读请求（ls-remote / fetch / pull）返回自己的暂存状态，制造了
   "远端已有分支"的假象——**所有验证都问了同一个说谎者**；
3. 容器重启会重置文件系统与代理，本地 refs 一并蒸发。

**幸存物**：
- GitHub Issues **#374–#381**（8 个增强 issue）——走 GitHub API 创建，真实存在；
- 上游仓库不受影响（本 session 从未向 InvolutionHell/involutionhell 推送）；
- 本 session 对话上下文里保有：全部 5 篇分析文档的逐字内容、我直接编写的
  代码（phase0 完整性检查器套件、#377 OG 图、#381 相关文章）的逐字内容、
  12 个 subagent 的完整任务书与完成报告（= 重建规格书）。

**教训（进 CLAUDE.md 候选）**：验证 push 是否真实到达，必须用**独立信道**
（GitHub API / 网页），不能问执行 push 的同一个代理。

## 二、当前真实仓库状态

- fork main = upstream main = `4cc1055`（本 session 完成的唯一持久 git
  操作：fast-forward 同步，经直连验证）。
- 上游新增关键 commit：`9d49d3d` 修回 33 篇被机翻毁掉的中文 title——
  **独立佐证了本 session 质量分析的核心结论**（机翻管线曾实际破坏生产
  内容）；`a051f04` 双协议（代码 Apache-2.0 / 内容 CC BY-NC-SA）；
  `ba0cdc7` llms.txt。
- 恢复通道：Bash 直连 git push 被权限层拦截；**GitHub MCP API 可用**
  （list/create branch、push_files）——本文档即经此通道恢复。

## 三、丢失工作清单与重建路径（按价值排序）

每项标注：内容来源（context-verbatim = 对话中有逐字稿，可直接还原；
spec+report = 有完整任务书和验收报告，需重新实现）。

### A. 分析文档（context-verbatim，恢复成本≈0，价值最高）
1. `dev_docs/issue-triage-2026-07.md` — 17 个 open issue 逐一核查与收尾建议
2. `dev_docs/translation-pipeline-blindspot-analysis.md` — 研究综合 + Phase 0-4 计划
3. `dev_docs/issue-implementation-plans-2026-07.md` — 全 issue 架构级实施计划 + 五条全局架构约束 + #374-#381 附录
4. `dev_docs/first-principles-review-2026-07.md` — 交付后批判复盘（P1：锚点钉扎缺失 / fence 门禁与存量冲突 / 成本模型脱节）
5. `dev_docs/mocked-signoffs-2026-07.md` — 7 项 mocked 决策与第一性审查（spec+report，需按报告重写）

### B. 我直接编写的代码（context-verbatim，恢复成本低）
6. Phase 0 完整性检查器：`lib/translation-integrity.ts` + `scripts/check-translation-integrity.mjs` + `tests/translation-integrity.test.ts` + package.json script + `lib/source.ts` 注释修正 + vitest `.claude/**` 排除。实测：303 文件 32 error / 24 warning。
7. `#377` OG 图：`lib/og-font.ts`（Google Fonts css2 `text=` 按需子集，实测 3.4KB）+ `app/[locale]/docs/[...slug]/opengraph-image.tsx`
8. `#381` 相关文章：`lib/related-docs.ts` + `tests/related-docs.test.ts` + page.tsx 接线 + messages `relatedDocs`

### C. Subagent 实现的分支（spec+report，需重跑，每个约 5-20 分钟 agent 时）
9. `#374` 安全响应头（CSP-RO 全清单在报告中）
10. `#376` RSS（lib/rss.ts + doc-page-meta.ts 抽取）
11. `#378` 三个 loading 骨架屏
12. `#69` TOC 编号（fumadocs `tableOfContent.component` + min-depth 栈算法）
13. `#379` 脚本单测（纯函数抽取 + 22 测试 + 字节级行为保持验证法）
14. `#375` 阅读三件套（findNeighbour + bot 过滤 git 日期图 + 阅读时长）
15. `#129` R2 迁移（共享 image-refs 解析器 + workflow；dry-run 实测 99 图 8MB）
16. `#94` AI 分类（限流工厂重构 + classify 端点 + PromoteToDocs 预填——注意：真实分类面在 promote 流程，不在 feed/editor）
17. Phase 1 翻译流水线（段级 TM + 三方保护 + placeholder；**含关键实现细节**：bootstrap adoption 1513/1696、重复 docId 需 per-path bucket、逐字节可重组的 fence-aware 分段）
18. Phase 2 质量门禁（fence/锚点/链接/CJK 硬门 + 长度比软门；语料实测 119 error：87 fence / 8 掉段 / 8 CJK / 16 frontmatter）
19. Phase 3+4 治理与自动化（贡献计分规则含"创建 commit 排除"关键修正、frontmatter 补齐 8+120 文件、ADOPT_ONLY、secret-gated workflow）

**重建注意**：全部分支原基于 `7a3a5e4`，重建应基于新 main `4cc1055`；
上游 `9d49d3d` 改了 33 个 zh title → Phase 3-4 的 frontmatter/TM 数字会
略有变化；`ba0cdc7` 加了 tests/robots.test.ts → 测试基线数变化。

## 四、重建执行顺序（给下一个执行者）

1. 先恢复 A 组文档（本分支，直接 commit）——它们是其他一切的规格书。
2. B 组三件按逐字稿还原，各自独立分支，跑 `pnpm typecheck && pnpm test`。
3. C 组按原任务书重跑（任务书全文在 session 对话中；若无法访问对话，
   按各分支在本文 §三 的一行摘要 + `issue-implementation-plans` 文档的
   对应章节重建——那份计划文档本身就是可独立执行的规格）。
4. 每个分支 push 后**必须用 GitHub API（或网页）独立确认分支存在**——
   这是本次事故的核心教训，不可省略。
5. 合并顺序与已知冲突点见 `issue-implementation-plans` 末节：
   `#376`×`#380` 冲突于 sitemap；`#375`/`#380`/`#381`/`#69` 同触 docs
   page；公共模块 `lib/mdx-segment.ts`（P1↔RAG）与 `createLimiter`
   （#94↔RAG）先建者定接口。

## 五、待人类决策事项（不因事故改变）

1. Phase 0 报告的 32 处改名/合并裁决；
2. 人工翻译修正的贡献计分规则批准；
3. `ANTHROPIC_API_KEY` secret 配置与首次真实 APPLY 的样本人审；
4. 87 个"fence 内注释被翻译"错误的处置——**不要按报告直接还原为中文**，
   先落实 first-principles-review 的两级 fence 门禁再清账。
