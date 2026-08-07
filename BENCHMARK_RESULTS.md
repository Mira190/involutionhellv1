# 集成验证基准结果（2026-08-07）

基线 = 同步后 main `4cc1055`；对照 = `claude/integration-2026-07`
（16 分支全合并 + OG 修复 + 2 个 P 级修正）。全部数字为本机实测。

## 路由分类（CLAUDE.md §2 强制项，串行 `pnpm build` 两次实测）

| | 基线 | 集成 | 判定 |
| --- | --- | --- | --- |
| 既有路由分类翻转 | — | **0** | ✅ 无回退 |
| 新增路由 | — | 4 | `ƒ /api/classify`（POST，设计如此）；`● /og/docs/[locale]/[...slug]`；`○ /rss.xml`；`○ /rss.en.xml` |
| `/[locale]/docs/[...slug]` | ● SSG | ● SSG | ✅ 四个分支改同一页面未破坏 SSG |

被证伪的初步结论：`/api/docs-tree` ƒ→○ 一度被归因于本集成，重建真基线
后确认是上游自身变化（两侧表均为 ○）。

## 测试与静态检查

| 指标 | 基线 | 集成 |
| --- | --- | --- |
| vitest | 上游自带 | **233/233 通过（23 文件）** |
| tsc --noEmit | 通过 | 通过 |
| 翻译语料完整性 | 无工具 | 32 error / 24 warning（工具新增，报告在 dev_docs） |
| 翻译质量门禁 | 无工具 | 103 error / 8 warning（含 87 个 fence 注释翻译历史欠账） |

## 发现并修复的真实缺陷（build 验证的直接产出）

1. `opengraph-image.tsx` 不能位于 catch-all 段下（Next.js 硬约束，build
   直接失败）→ 迁移为 `● /og/docs/[locale]/[...slug]` 静态 route handler，
   `dynamicParams=false` 同时消除爬虫触发运行时渲染的 CPU 逃逸面。
