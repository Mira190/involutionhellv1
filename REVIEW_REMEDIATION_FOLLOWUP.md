# review-remediation 分支复核（2026-08-07）

对 `0620b3c "fix: enforce production safety invariants"` 的实测复核。
结论：**方向全对，但该 commit 无法通过它自己新增的门禁**；已修复并验证。

## 一、阻断级（已修，否则 main 全部部署失败）

### 1. `pnpm typecheck` 失败 5 处 → 新 deploy.yml 把它设为必过步骤
- `tests/rate-limit.test.ts`：`process.env.NODE_ENV` 在 @types/node 里是
  只读字面量，直接赋值/delete 报 TS2540/TS2704（vitest 不做类型检查，
  所以 235 个测试全绿掩盖了它）。
- `tests/translate-provider.test.ts`：`vi.fn(async (url: string | URL...))`
  与 `fetch` 的重载签名不兼容（TS2322）。
- 修：经 `process.env as Record<string, string|undefined>` 可写视图赋值；
  mock 改 `vi.fn<typeof fetch>`。实测 typecheck 通过、9 个新测试仍绿。

### 2. "Verify build is reproducible" 门禁在构造上不可满足
- 实测：干净树跑 `pnpm build` 后 `git status --porcelain` **必然非空**——
  `generated/doc-dates.json` 由 `git log` 推导，任何新 commit 触碰文档都会
  改变它（本分支实测漂移 1 条：142.环形链表II 从 08-03 → 08-06，正是被
  上一个 commit 触碰所致）。
- 这是**鸡生蛋**：把刷新后的 map 一起 commit，该 commit 本身又会让 map 过期。
- 修：门禁排除 `generated/doc-dates.json` 并注明理由；其余路径照旧严格——
  escape-angles 那类真正的源码污染仍会被拦住。实测干净树 build 后门禁输出为空。
- 同一 bug 在 `translate-docs.yml` 的 "Validate generated transaction" 里
  重复出现（unstaged 检查），一并修。

### 3. 定时任务在 secret 未配置时每周红叉
- `APPLY_RUN` 对 `schedule` 恒为 1，缺 key 直接 `exit 1` → secret provision 前
  每周一次失败告警，必然被当噪音忽略（真故障也随之被淹没）。
- 修：schedule + 无 key → `::notice` 跳过；手动 apply 缺 key 仍立刻报错。

## 二、已验证安全的改动（不必回退）

- **MAX_TOKENS 16000 → 8000**：实测全语料 3129 个 segment，最大约 3277
  输入 token（zh→en 输出约 5.2k），**0 个** segment 会触顶；且 provider 断言
  `stop_reason === "end_turn"`，超限会显式失败而非静默截断。安全。
- **限流 fail-closed**：方向正确（公开 AI 端点无成本保护时应拒绝而非放行），
  503 + Retry-After 语义合理，本地 dev 仍 skip。
- **PR 化翻译同步**（不再直推 main）：显著优于原设计，机器产物进人审。
- **classify 输入上限**（16KB / 标题 300 字）+ 结构化日志：合理。

## 三、建议但未改（留给维护者裁决）

1. `NODE_ENV === "production"` 会把 **Vercel preview** 也算作生产 → preview
   未配 Upstash 时 AI 功能全灭。若希望 preview 可用，改判 `VERCEL_ENV`。
2. `classify` 的降级路径每请求 `console.warn`：缺 key 时等于每请求一条日志，
   serverless 日志量/成本可观。建议对"配置缺失"类降级按实例生命周期只警告
   一次（沿用 rate-limit 的 `hasWarnedMissingUpstash` 模式），保留真错误的逐条日志。
3. 该 commit 顺带删除了 `lib/rate-limit.ts` 里大量注释。其中两条是承重的，
   已恢复：XFF **取最后一项**的防伪造理由（不写会被后人"修"成取第一项，
   等于送出限流绕过）、Upstash env 三套命名的兜底理由。其余精简保留不动。
4. 长期：`generated/doc-dates.json` 是历史推导产物，本质不适合进 git。
   可选方案——从 git 移除 + `dev`/`prebuild` 均生成（代价：直接跑
   `next dev` 的贡献者需先跑一次生成）。当前排除法已够用，不急。
