# 基础设施事故复盘：git 信道的 fork/upstream 混淆（2026-07-19）

> 结论先行：**没有任何工作丢失**。16 个分支全部安全在
> `Mira190/involutionhellv1`（经 GitHub API 逐一核对 SHA）。但排查过程
> 暴露了一个值得记录的基础设施陷阱和两条硬教训。

## 现象时间线

1. 容器重启后，本地 clone 的 `origin` URL 显示为 fork
   （`github.com/Mira190/involutionhellv1`），但 `git fetch` / `ls-remote`
   返回的却是 **upstream**（`InvolutionHell/involutionhell`）的数据：
   87 个 heads 全是上游分支、`main` 指向上游新 tip `4cc1055`、本 session
   的 16 个分支"消失"。
2. 基于这个假象，一度误判为"push 经本地代理从未到达 GitHub、全部工作
   丢失"，并起草了错误的事故报告。
3. 用 **GitHub API**（独立信道）核对后翻案：fork 上 16 个分支齐全，
   SHA 与各自验收报告完全一致；fork main 仍在 `7a3a5e4`（未与上游同步）。

## 根因

session 的 git 出口经透明代理；容器重启后代理路由把 fork URL 解析到了
upstream 仓库的数据面。**读写都走同一个错误信道**，所以 fetch、ls-remote、
push 的返回值彼此自洽——一致地错。期间执行过的 `git push origin main`
实际是把 upstream main 推回 upstream main（no-op，无副作用，且从未
force push——这是没造成实际损害的关键运气+纪律）。

## 两条硬教训（CLAUDE.md 候选）

1. **验证远端状态必须用独立信道**：核对 push 是否到达，用 GitHub API 或
   网页，不要问执行 push 的同一个 git remote——它可能自洽地说谎。
2. **在异常状态下禁止 force push / 删除远端引用**：本次若在"分支丢了"
   的误判下尝试强推恢复，就会把错误数据写进 upstream。破坏性 git 操作
   前必须先用独立信道确认仓库身份（`api.github.com/repos/<owner>/<repo>`
   对比 branch SHA）。

## 当前待办（因信道问题遗留）

1. **fork main 尚未与 upstream 同步**（7a3a5e4 → 4cc1055，上游领先约
   20 个 PR，含 `9d49d3d` 修回 33 篇被机翻毁掉的 zh title、`a051f04`
   双协议、`ba0cdc7` llms.txt）。最快路径：GitHub 网页上 fork 的
   "Sync fork"一键完成；或修复 git 信道后 ff push。
2. 16 个分支基于 `7a3a5e4`，与新 main 合并时 content 侧（33 个 title
   修复）可能与 phase3-4 的 frontmatter 补齐轻微冲突——合并时以上游
   title 为准。
3. 集成验证（全分支合一 + 串行 `pnpm build` 路由表 diff）依赖可信的
   git 信道拉取分支对象，待信道恢复后按
   `issue-implementation-plans-2026-07.md` 末节的合并顺序执行。
