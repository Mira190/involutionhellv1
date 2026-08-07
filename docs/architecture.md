# Architecture（快照）

Next.js 16 App Router + fumadocs（content/docs，dot-suffix i18n，fallback zh）
+ next-intl URL 段化（全站 SSG 优先，Vercel Hobby CPU 红线）+ Postgres
（Sa-Token 用户体系为准，NextAuth 表冻结）+ Upstash 限流 + R2 存储。
翻译流水线：lib/mdx-segment（fence-aware 分段哈希）→ 段级 TM（generated/）
→ 三方保护 → 质量门禁（changed-only strict CI）→ secret-gated workflow。
约束全文：`dev_docs/issue-implementation-plans-2026-07.md` 开头五条。
