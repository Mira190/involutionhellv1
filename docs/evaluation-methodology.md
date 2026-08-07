# Evaluation Methodology

1. 路由分类：串行 `pnpm build`，`grep -E '[○●ƒ] '` 提取表，与真基线
   （同步后 main 的 detached checkout）diff。基线必须重建验证，不可用
   本地陈旧 main（本轮踩过）。
2. 行为保持类重构：原/新实现对全语料跑，输出逐字节 diff（escape-angles
   先例）。
3. 翻译质量：确定性门禁（fence/锚点/链接/CJK/frontmatter）为硬指标，
   LLM 评分仅分诊；阈值按语料分布定，不移植他人绝对值。
   依据：`dev_docs/translation-pipeline-blindspot-analysis.md` §3。
4. 远端状态断言一律以 GitHub API 为准。
