# 优化实施计划（2026-08-14，对抗验证驱动）

> 方法：7 个维度（架构路由 / 安全 / 性能成本 / 翻译流水线 / 前端 / CI 仿真 /
> 知识库一致性）并行第一性审查 → 45 条原始发现 → 去重后对 8 条 high/medium
> 逐条**对抗性证伪**（每条一个专职反驳者，实际重跑引用的测量）→
> **8 confirmed / 0 refuted**。每条带 file:line 级证据与验证者修正。
> 前提：upstream/main = `4cc1055`（0 新 commit），consolidated = `67ffaba`，
> 基线 240 测试全绿。
>
> 本文取代 NEXT_STEPS.md 与 docs/optimization-plan.md 的执行清单角色；
> 那两份保留为历史记录。

## Phase A —— 生产已坏 / 立即修（全部经对抗验证）

### A1【high/S】/og/* 被 next-intl 中间件劫持：全站文档社交卡片 404

- **事实**：`proxy.ts` matcher 排除组没有 `og`；`/og/docs/zh/...` 无点号
  → 进中间件 → next-intl 307 到 `/<协商locale>/og/docs/...` → 该路由不存在
  → 404。已实测两条链路（matcher regex + 真实 createMiddleware 执行）。
  影响：所有 og:image / twitter:image URL 均死链；`/og/cover.png` 兜底图
  不受影响（带点号）。
- **修**：matcher 排除组加 `og`；`tests/proxy-matcher.test.ts` 增加类级
  守卫——枚举 app/ 根下非 `[locale]`/api 的无点号路由段，逐一断言被
  matcher 排除（当前该类只有 og 一个活成员，守卫防的是下一个）。
- **度量**：curl 生产 `/og/docs/zh/<slug>` 应 200 image/png 不再 307。

### A2【high/S】DocsFooterNav 双重 locale 前缀：上一篇/下一篇全站 404

- **事实**：fumadocs `page.url` 已含 locale 前缀（hideLocale 默认 never），
  组件又用 next-intl 的 Link（localePrefix always 无条件再加）→
  `/zh/zh/docs/...`。同页的相关文章区块用 next/link 是对的——两处不一致
  正是漏洞来源。
- **修**：DocsFooterNav 改 `next/link`。
- **度量**：渲染出的 href 单前缀；点击可达。

### A3【high/S】每次文档页浏览触发一次 POST /api/suggestions——SSG 被函数调用层击穿

- **事实**（上游存量 bug，非本轮引入）：`DocsAssistant.tsx:185-218` 的
  welcome suggestions 在组件 **mount** 时就 fetch（仅防重复，不看助手
  是否打开），而组件无条件挂在全部 636 个文档页上。POST 不可 CDN 缓存
  → 每次真实浏览 = 1 次 serverless 调用 + 2 条 Upstash 命令（开了
  analytics 实际更多）+ 未命中时 1 次 GLM 调用。副作用：逛 10 页/分钟
  就烧光与聊天**共享**的限流池（校园 NAT 共享 IP 是核心受众）；
  Upstash 免费额 10k 命令/天 ≈ 5k 浏览/天。
- **修**：suggestions 拉取移到助手**首次打开**时；可选二期把 welcome
  变体改 GET + s-maxage 让 CDN 吸收。
- **度量**：打开文档页无 /api/suggestions 请求；打开助手才有；
  Vercel invocations 曲线应有量级下降。

### A4【high/S】content-check 两个拦截门在 depth-1 checkout 下是静默空转

- **事实**：checkout 无 `fetch-depth: 0`，`check-doc-paths.mjs` 与
  `check:frontmatter` 算不出 PR diff，双双 exit 0——重命名/删除文档
  不再被要求补 301 覆盖（正是该门存在的理由）。验证者修正：实际步序里
  frontmatter 检查先跑并浅 fetch origin/main，使 doc-paths 的失败形态
  变化，但两门皆不设防的结论不变。
- **修**：checkout 加 `fetch-depth: 0`；两脚本在 `GITHUB_ACTIONS` 下
  diff 基线不可得时**响亮失败**（::error + 非零退出）而不是静默通过。
- **度量**：造一个重命名文档且不补 redirect 的测试 PR → 门必须红。

### A5【high→medium 组/M】resolveDocPath 假缓存 + 三层重复解析 + 生产兜底

三条相关发现合并为一次手术（同一文件同一职责）：

1. **假缓存**：`next: { revalidate: 300 }` 只缓存 200 响应，而该端点
   只回 301/308/404；传了 AbortController signal 又使 Next 的请求内
   memoization 显式失效（dedupe-fetch.js:88 实证）；generateMetadata 与
   页面组件各调一次 → 单个未知 ASCII 路径的首次扫描 = 2 次未缓存后端
   往返（各 2.5s 预算）。注释"缓存 5 分钟"为假。
2. **第三层客户端 resolve**：not-found.tsx 里 500ms 超时版重复问一遍。
   验证者修正：它不是死代码——它救过一次生产事故（服务端 resolve 被
   CF 拦 UA），是有意的韧性层，**不能直接删**，但应与服务端共享实现与
   参数（现在两套超时/UA 各自漂移）。
3. **生产兜底**：`BACKEND_URL ?? "https://api.involutionhell.com"` 让
   本地/预览环境静默查生产解析表，permanentRedirect 还会被浏览器缓存。
- **修**：resolveDocPath 包 `React.cache()`（页面+metadata 请求内去重）；
  去掉 signal 改用可缓存的超时方式或后端改 200+JSON（后端仓库改动，
  先做前端侧）；删除假注释；生产兜底改为"未配置即跳过解析返回 null"；
  客户端层保留但抽公共常量对齐 UA/超时语义。
- **度量**：单次未知路径渲染后端往返 2→1；repeated junk path 的
  `x-vercel-cache` 观察项挂到部署后验证清单。

### A6【high/M】翻译流水线 placeholder-mismatch 生命周期闭环断裂

- **事实**：段落两次 placeholder 校验失败后，中文原文被写进 .en 且无 TM
  条目；文档承诺"下次运行重试"是假的——下次 `decideUnit` 会把它判成
  human-edit conflict，permanent 卡死；`ADOPT_CONFLICTS=1` 的补救更会把
  中文文本收编进 TM 当"人工版本"（毒化）；CI 里一个坏段落让整个 weekly
  sync 红掉。验证者修正：质量门禁会拦住这类 pair 进 main，所以是
  流水线内伤而非线上事故。
- **修**：`decideUnit` 前置一条规则——目标段与源段**逐字节相同**视为
  "未翻译"而非"人工编辑"，直接 retranslate（对合法的纯代码段免费：
  translateUnit 对 protected-only 单元本就 0 调用早退）；加集成测试锁住
  "失败段下次运行确实重试"。
- **度量**：新增测试；conflict 报告中不再出现 zh==en 的假 human-edit。

## Phase B —— 既定计划项（未变，按序继续）

B1 锚点钉扎（P1-1，unalignable 7→0）；B2 Batches+缓存前缀+glossary
（P1-2）；B3 rank/feed 动态根因核查（P2）；B4 原 P3 五小项（其中
"classify warn-once"与"VERCEL_ENV 区分 preview"两条与 A 组同文件，
顺手带上）。详见 docs/optimization-plan.md 对应章节。

## Phase C —— 低危背账（16 条，未逐条对抗验证，动工前先自验）

按主题归组，标注建议处置：

| 主题 | 条目 | 处置 |
| --- | --- | --- |
| 信息泄露 | docs-tree API 回显 cwd/Node 版本/env 提示（两个维度独立发现）；suggestions debug 字段漏原始模型输出 | 下轮首修（S） |
| 死配置 | 根目录 `i18n.ts`（defaultLocale 'en'）与真实路由配置矛盾；`docs-i18n-design.md` 过期设计稿在根目录 | 删除/归档（S） |
| CI 细节 | IndexNow 只 diff HEAD~1；translate-docs 用 `event.repository.default_branch` 在 schedule 触发下为空；PR 工作流多余 `actions: write` | 合并为一个 CI 卫生 PR（S） |
| 门禁盲区 | 4 空格缩进代码块对 masker 和全部门禁不可见（语料有 1 个活实例）；TOC 编号在 heading 级别跳跃回退时重号 | 各补一条规则+测试（S） |
| 前端 | 骨架屏 aria-hidden 无可访问加载态；32 个孤儿 en 文档的语言切换落到 SSR 404 还烧一次 resolve；sitemap/RSS 对已编码 slug 双重编码 | 与 Phase 0 语料清理联动（S/M） |
| 知识库 | REVIEW_REMEDIATION_FOLLOWUP 把已删除的豁免描述为现状；等 | 一次性 stale 清扫 + 给 CLAUDE.md 增补两条本周期铁律（独立信道验证 / 构造性保证≠存量标准） |
| 已证伪防重提 | 性能维度实测 4 项假设成本风险（edge bundle/字体/OG/build 时长）为非问题 | 记录在案，不再排查 |

## 对抗验证的价值自证

45 条原始发现里，8 条 high/medium 全部扛住了专职反驳者（0 refuted），
但其中 6 条被验证者**修正了精度**（locale 协商方向、ISR 页面级缓存的
未验证性、客户端 resolve 层的历史正当性、Upstash analytics 低估、
CI 步序交互、next-intl 行号引用）——这些修正两次改变了 Phase A 的
处置方案（A5.2 从"删除"改为"保留但对齐"；A4 的失败形态描述）。
单轮无验证的审查会带着这 6 处误差进入实施。

## 执行状态

- [x] A1 og matcher + 类级守卫测试（守卫按"含 route/page 文件的目录"过滤，
  避免误报 fonts/hooks 等资产目录）
- [x] A2 DocsFooterNav 单前缀
- [x] A3 suggestions 与 assistant_opened 埋点都延迟到首次打开（顺带修正了
  埋点语义：原来"opened"在 mount 就上报）
- [x] A4 content-check fetch-depth: 0 + 两脚本 CI 下基线不可得即 ::error 退出
- [x] A5 React.cache 去重 + 删假缓存注释 + 生产兜底改为未配置即跳过
- [x] A6 decideUnit 前置"目标==源"规则（有 TM → reuse 免费恢复；无 TM →
  translate 重试）+ 两个场景的回归测试。实施中发现规则放在 entry 分支后
  不够：TM 有条目时原文会被 adopt-edit 收编——毒化路径的另一张脸，已一并堵死
- 验收：typecheck + 240+ 测试 + 串行 build 表 diff（预期仅 og 路由行为
  变化，无分类翻转）+ build 后工作树干净
