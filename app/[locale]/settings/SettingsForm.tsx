"use client";

// 用户偏好设置表单（Client Component）
// 负责：拉取偏好数据、渲染编辑 UI、提交保存、同步 ThemeProvider

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  useRouter as useLocaleRouter,
  usePathname as useLocalePathname,
} from "@/i18n/navigation";
import { useAuth } from "@/lib/use-auth";
import { useTheme } from "@/app/components/ThemeProvider";

// 与后端 preferences 字段一一对应
interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: "zh" | "en";
  aiDefaultProvider: "intern" | "openai" | "gemini";
}

const DEFAULT_PREFS: UserPreferences = {
  theme: "system",
  language: "zh",
  aiDefaultProvider: "intern",
};

// 从 localStorage 读取 satoken
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("satoken");
}

// 骨架屏占位
function SkeletonRow() {
  return (
    <div className="animate-pulse flex flex-col gap-2">
      <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-24" />
      <div className="h-10 bg-neutral-100 dark:bg-neutral-800 rounded w-full" />
    </div>
  );
}

export function SettingsForm() {
  const { status } = useAuth();
  const { theme: currentTheme, setTheme } = useTheme();
  const router = useRouter();
  // URL 段化路由下语言由 URL locale 段决定（cookie 只是 middleware 的
  // 记忆），切换必须走 next-intl router 换 URL —— 与 LocaleToggle 同机制
  const activeLocale = useLocale() as UserPreferences["language"];
  const localeRouter = useLocaleRouter();
  const localePathname = useLocalePathname();
  const t = useTranslations("settings");

  // 初始值：主题从 ThemeProvider 读（避免表单与页面实际主题不一致），
  // 语言从当前 URL locale 读
  const [prefs, setPrefs] = useState<UserPreferences>(() => ({
    ...DEFAULT_PREFS,
    theme: currentTheme as UserPreferences["theme"],
    language: activeLocale,
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  // toast 定时器 ref：新 toast / 卸载时清掉旧 timer，避免 setState on unmounted
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 未登录时重定向
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?redirect=/settings");
    }
  }, [status, router]);

  // 监听全局 ThemeProvider 的主题变化（比如 Header 的 ThemeToggle）
  // 把变化同步到表单选中态，避免"外部切换了但 settings 还显示旧值"
  useEffect(() => {
    setPrefs((p) =>
      p.theme === currentTheme
        ? p
        : { ...p, theme: currentTheme as UserPreferences["theme"] },
    );
  }, [currentTheme]);

  // 拉取偏好数据
  useEffect(() => {
    if (status !== "authenticated") return;
    const token = getToken();
    // token 缺失时立刻结束 loading 并提示 + 跳转，否则页面会卡在骨架屏
    if (!token) {
      setLoading(false);
      showToast("error", t("toast.tokenMissing"));
      router.replace("/login?redirect=/settings");
      return;
    }

    fetch("/api/user-center/preferences", {
      headers: { satoken: token },
    })
      .then((res) => {
        if (!res.ok) throw new Error(t("toast.fetchFail"));
        return res.json();
      })
      .then((body) => {
        if (body?.success && body?.data) {
          const merged = { ...DEFAULT_PREFS, ...body.data };
          // 表单显示后端的"已保存"值；但不强制 setTheme 覆盖
          // 因为用户可能在别处用 ThemeToggle 改过本地主题，
          // 以本地当前主题为准，后端值只是表单的初始显示
          setPrefs({
            ...merged,
            theme: currentTheme as UserPreferences["theme"],
          });
        }
      })
      .catch(() => {
        showToast("error", t("toast.loadError"));
      })
      .finally(() => setLoading(false));
    // setTheme 是 ThemeProvider 提供的稳定引用，router 同理；这里依赖 status 变化触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 组件卸载时清掉残留 toast timer
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function showToast(type: "success" | "error", msg: string) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ type, msg });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    const token = getToken();
    // token 缺失时给明确反馈并跳转登录，而不是静默返回让用户摸不着头脑
    if (!token) {
      showToast("error", t("toast.tokenMissingSave"));
      router.replace("/login?redirect=/settings");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/user-center/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          satoken: token,
        },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error(t("toast.saveFail"));
      const body = await res.json();
      if (body?.data) {
        const merged: UserPreferences = { ...DEFAULT_PREFS, ...body.data };
        setPrefs(merged);
        // 主题变化立即同步到 ThemeProvider（同步写 localStorage）
        setTheme(merged.theme);
        // 语言变化 = 切到另一 locale 的同一 URL（next-intl 会同步
        // NEXT_LOCALE cookie）；语言没变就不动
        if (merged.language !== activeLocale) {
          localeRouter.replace(localePathname, { locale: merged.language });
        }
      }
      showToast("success", t("toast.saveSuccess"));
    } catch {
      showToast("error", t("toast.saveFail"));
    } finally {
      setSaving(false);
    }
  }

  // 加载中或未登录均显示骨架屏，避免闪烁
  if (status === "loading" || loading) {
    return (
      <div className="flex flex-col gap-8">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  // 未认证时页面已重定向，此处不需要渲染
  if (status === "unauthenticated") return null;

  const themeOptions: { value: UserPreferences["theme"]; label: string }[] = [
    { value: "light", label: t("theme.light") },
    { value: "dark", label: t("theme.dark") },
    { value: "system", label: t("theme.system") },
  ];

  const langOptions: { value: UserPreferences["language"]; label: string }[] = [
    { value: "zh", label: "中文" },
    { value: "en", label: "English" },
  ];

  const aiOptions: {
    value: UserPreferences["aiDefaultProvider"];
    label: string;
  }[] = [
    { value: "intern", label: t("ai.intern") },
    { value: "openai", label: "OpenAI" },
    { value: "gemini", label: "Gemini" },
  ];

  return (
    <div className="flex flex-col gap-10">
      {/* Toast 提示 */}
      {toast && (
        <div
          className={`border px-4 py-3 font-mono text-sm ${
            toast.type === "success"
              ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
              : "border-red-500 text-red-600 dark:text-red-400"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* 主题设置 */}
      <section>
        <label className="block font-serif font-bold text-lg mb-3">
          {t("theme.label")}
        </label>
        <div className="flex gap-0 border border-[var(--foreground)]">
          {themeOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                // 立即同步到 ThemeProvider，避免"表单已选但页面没变"的割裂感
                setPrefs((p) => ({ ...p, theme: value }));
                setTheme(value);
              }}
              className={`flex-1 py-2 px-4 font-mono text-sm uppercase transition-colors ${
                prefs.theme === value
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "bg-transparent text-[var(--foreground)] hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* 语言设置 */}
      <section>
        <label className="block font-serif font-bold text-lg mb-3">
          {t("language.label")}
        </label>
        <div className="flex gap-0 border border-[var(--foreground)]">
          {langOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setPrefs((p) => ({ ...p, language: value }));
                // 切 URL locale 段（旧的写 locale cookie + refresh 机制在
                // URL 段化路由下不生效：URL 优先，且 middleware 读的是
                // NEXT_LOCALE cookie）
                if (value !== activeLocale) {
                  localeRouter.replace(localePathname, { locale: value });
                }
              }}
              className={`flex-1 py-2 px-4 font-mono text-sm uppercase transition-colors ${
                prefs.language === value
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "bg-transparent text-[var(--foreground)] hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* AI 默认提供商 */}
      <section>
        <label className="block font-serif font-bold text-lg mb-3">
          {t("ai.label")}
        </label>
        <div className="flex gap-0 border border-[var(--foreground)]">
          {aiOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setPrefs((p) => ({ ...p, aiDefaultProvider: value }))
              }
              className={`flex-1 py-2 px-4 font-mono text-sm transition-colors ${
                prefs.aiDefaultProvider === value
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "bg-transparent text-[var(--foreground)] hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* 提交按钮 */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="font-mono text-sm uppercase tracking-widest px-8 py-3 border-2 border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] hover:bg-transparent hover:text-[var(--foreground)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
