# Technical Debt（登记簿）

- 87 fence 注释翻译欠账（处置前置条件：两级门禁）。
- 32 error/24 warning 语料命名混乱（Phase 0 报告，需人工裁决）。
- escape-angles 非幂等（2 文件），历史 bug。
- TM 无 GC；glossary 缺失；en→zh 方向无软门。
- doc-page-meta 与 doc-entry 的 sanitizeSlugPath/docPathname 仍有一对
  近义函数，下次路过合并。
- `.claude/**` 排除只覆盖 vitest。
