import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // .claude/worktrees 下是 agent 的临时 git worktree，里面的测试文件
    // 属于别的分支，混进主套件会用错源码
    exclude: ["**/node_modules/**", "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
