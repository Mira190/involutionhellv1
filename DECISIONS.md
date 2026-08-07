# DECISIONS —— 关键决策及理由（索引）

已批准/已执行：分支即决策记录（16 个分支各一）；深度理由见
`dev_docs/issue-implementation-plans-2026-07.md`（五条全局架构约束）与
`dev_docs/translation-pipeline-blindspot-analysis.md`。

Mocked（待维护者追认，全部带第一性审查）：
`dev_docs/mocked-signoffs-2026-07.md` —— 7 项，其中 2 项落在代码里有
`MOCK:` 注释（贡献计分规则 / workflow secret 假设）。

本轮新增：OG 走静态 route handler 而非 metadata 文件（Next 硬约束 +
CPU 逃逸面）；翻译默认模型 Sonnet（成本 5x 差、质量无必要）；RSS 日期
以过滤后 git 日期为准（frontmatter date 缺失/过时率高）。
