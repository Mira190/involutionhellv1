# HANDOFF —— 给下一个执行者（人或更小的模型）

## 你需要知道的全部状态

1. **fork main 已与 upstream 同步**（`4cc1055`，直连推送验证）。
2. **16 个特性分支安全在 fork**，全量清单与逐分支验收报告索引：
   `dev_docs/incident-handoff-2026-07-19.md` §三。
3. **集成分支 `claude/integration-2026-07`**：16 分支合并 + 冲突已解 +
   OG 修复 + P 级修正；233 测试绿、路由表零回退（BENCHMARK_RESULTS.md）。
4. 深度文档全在本分支 `dev_docs/`：issue triage、盲点分析（Phase 0-4 计划）、
   全 issue 架构实施计划、mocked-signoffs 决策簿、第一性复盘、两次事故复盘。

## 干活守则（血泪换来的）

- 验证远端状态用 GitHub API，别信本地 remote（见 incident-git-channel 文档）。
- 路由类改动必须串行 `pnpm build` 前后表 diff；prebuild 会弄脏
  `content/.../142.环形链表II_translated.md`（已知非幂等），commit 前
  `git checkout -- content`。
- 新 AI 端点必须挂 `lib/rate-limit.ts` 工厂。

## 下一步按序做

见 NEXT_STEPS.md；每步的完整规格在 dev_docs 对应文档里，无需重读代码库。
