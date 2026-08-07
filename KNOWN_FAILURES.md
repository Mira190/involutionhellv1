# KNOWN_FAILURES —— 已知失败与负面结果

1. **87 个 fence-integrity error 不是待修清单**：全是历史翻译把代码注释
   译成英文；按报告"清零"会让英文文档变差。需先实现两级 fence 门禁
   （见 dev_docs/first-principles-review §P1-2）再处置。
2. **7 个 zh/en 段数不齐的文档**：三方对齐按位置，人为增删章节即整篇跳过；
   等锚点钉扎（P1-1）落地后按 id 重对齐，勿手修。
3. **escape-angles 对 2 个文件非幂等**（142.环形链表II / mempool 对）：
   每次 prebuild 重复转义，为已知历史 bug，工作树会被弄脏。
4. **沙盒并发 build 必被 SIGTERM**：并行 agent 时代的返工根源；串行可过。
5. **本地 git 信道曾整体指错仓库**（读写一致地错）：不可复现于正常环境，
   但验证守则因此固化为"远端状态以 GitHub API 为准"。
6. 被证伪的判断记录：/api/docs-tree 分类翻转≠本集成造成（上游变化）；
   "16 分支全部丢失"≠事实（信道错觉）。
