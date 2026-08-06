"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Giscus from "@giscus/react";
import { useLocale } from "next-intl";
import { useTheme } from "./ThemeProvider";

interface GiscusCommentsProps {
  className?: string;
  docId?: string | null;
}

// 用 useSyncExternalStore 代替 useEffect+setState(true) 的 mounted 哨兵，
// SSR 快照固定返回 false，客户端返回 true，避免 react-hooks/set-state-in-effect
const emptySubscribe = () => () => {};

export function GiscusComments({ className, docId }: GiscusCommentsProps) {
  const { theme } = useTheme();
  const locale = useLocale();
  const normalizedDocId = typeof docId === "string" ? docId.trim() : "";
  const useSpecificMapping = normalizedDocId.length > 0;
  // mounted 门槛：SSR 阶段 ThemeProvider 的 useState 初值是 defaultTheme("dark")，
  // 和客户端 hydrate 后从 localStorage 读到的真实主题可能不同。
  // 如果这里直接渲染 Giscus，iframe 会以 SSR 的错主题加载；之后即使 key 变化触发
  // remount，@giscus/react 的 iframe 也可能残留旧 theme。延迟到 mount 后再渲染，
  // 用的就是客户端已经对齐过 localStorage 的主题。
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [isSystemDark, setIsSystemDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) =>
      setIsSystemDark(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  const resolvedTheme = useMemo<"light" | "dark">(() => {
    if (theme === "system") {
      return isSystemDark ? "dark" : "light";
    }
    return theme === "dark" ? "dark" : "light";
  }, [isSystemDark, theme]);

  if (!mounted) {
    // 占位 div 保持布局稳定，避免 mount 前后文档滚动位置跳动
    return <div className={className} aria-hidden />;
  }

  return (
    <div className={className}>
      <Giscus
        key={resolvedTheme} // force re-render when theme changes
        repo="InvolutionHell/involutionhell"
        repoId="R_kgDOPuD_8A"
        category="Comments"
        categoryId="DIC_kwDOPuD_8M4Cvip8"
        mapping={useSpecificMapping ? "specific" : "pathname"}
        term={useSpecificMapping ? normalizedDocId : undefined}
        strict="0"
        reactionsEnabled="1"
        emitMetadata="0"
        inputPosition="top"
        theme={resolvedTheme}
        lang={locale === "en" ? "en" : "zh-CN"}
        loading="lazy"
      />
    </div>
  );
}
