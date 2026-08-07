# NEXT_STEPS —— 按价值排序的后续清单

已在本分支完成第一轮 review remediation：主 CI 强制 test/typecheck/build，
自动翻译改为 bot 分支 + PR 事务，生产 AI 限流缺失时 fail closed，并为公开
分类端点增加请求上限与结构化运行结果日志。

1. 【人】真实配置 `ANTHROPIC_API_KEY`，先完成代表性语料的 provider-backed
   抽样评审；真实质量门通过前不要合并自动翻译 PR。
2. 若新的 reproducible-build 门暴露 prebuild 写脏工作树，修生成器幂等性，
   不得在 CI 中回退或忽略该检查。
3. 锚点钉扎 Phase 1.5：以稳定 heading id 替代位置对齐，并重新处理 7 篇
   当前无法对齐的文档。
4. 两级 fence 门禁：代码 token 变化为 error，仅注释翻译差异降级；之后再
   处置 87 条历史欠账。
5. glossary + Batches API + token/dollar budget；TM key 加 policy/glossary
   版本，并将 human-reviewed entry 与 machine cache 分层。
6. 用 MDX AST 替代 regex placeholder 保护；重复 `docId` 改为 hard failure，
   在修正现有重复数据后启用。
7. TM GC；related-docs 覆盖率与点击率；分类建议采纳/覆盖率指标。
8. 将历史路径 resolve 尽量生成静态 redirect map；若保留运行时 resolve，
   增加调用量、命中率、延迟和 bot 成本观测。
9. 【人】mocked-signoffs 逐项追认；Phase 0 报告 32 处命名问题人工裁决。
10. 按风险域拆分向 upstream 提交，避免把全部集成作为不可分割的大 PR。
