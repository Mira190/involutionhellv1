"use client";

import { useEffect, useMemo, useState } from "react";
import { TreeSelect } from "antd";
import type { DataNode } from "antd/es/tree";
import { Input } from "@/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { type DirNode } from "@/lib/submission";
import { sanitizeDocumentSlug } from "@/lib/sanitizer";
import {
  CREATE_SUBDIR_SUFFIX,
  toTreeSelectData,
} from "@/app/components/contribute/tree-utils";
import type { ClassifySuggestion } from "@/app/components/useClassifySuggestion";

interface DocsDestinationFormProps {
  onChange?: (path: string) => void;
  suggestion?: ClassifySuggestion | null;
}

export function DocsDestinationForm({
  onChange,
  suggestion,
}: DocsDestinationFormProps) {
  const [tree, setTree] = useState<DirNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [newSub, setNewSub] = useState("");
  const [userPicked, setUserPicked] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/docs-tree", { cache: "no-store" });
        const data = await res.json();
        if (mounted && data?.ok) {
          setTree(data.tree || []);
        }
      } catch {
        // API 失败是预期行为（开发环境常见），静默回退到静态文件
        try {
          const res = await fetch("/docs-tree.json");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (mounted && data?.ok) {
            setTree(data.tree || []);
          }
        } catch (fallbackError) {
          // 静态文件也失败才是真正的问题
          console.error("无法加载文档目录树:", fallbackError);
          // 用户仍可继续使用，但无法选择目录
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const suggestionApplied =
    !userPicked && !!suggestion && selectedKey === suggestion.slug;

  // AI 建议只在用户没有手动选择时预填；一旦用户自己选过，建议永远不再覆盖
  useEffect(() => {
    if (!suggestion || userPicked) return;
    if (!tree.some((node) => node.path === suggestion.slug)) return;
    setSelectedKey((prev) => (prev ? prev : suggestion.slug));
    setExpandedKeys((prev) =>
      prev.includes(suggestion.slug) ? prev : [...prev, suggestion.slug],
    );
  }, [suggestion, userPicked, tree]);

  const options = useMemo(() => toTreeSelectData(tree), [tree]);

  const sanitizedSubdir = useMemo(
    () => sanitizeDocumentSlug(newSub, ""),
    [newSub],
  );

  const finalDirPath = useMemo(() => {
    if (!selectedKey) return "";
    if (!selectedKey.endsWith(CREATE_SUBDIR_SUFFIX)) return selectedKey;
    const [l1] = selectedKey.split("/");
    if (!l1 || !sanitizedSubdir) return "";
    return `${l1}/${sanitizedSubdir}`;
  }, [selectedKey, sanitizedSubdir]);

  useEffect(() => {
    onChange?.(finalDirPath);
  }, [finalDirPath, onChange]);

  const needsSubdirName = selectedKey.endsWith(CREATE_SUBDIR_SUFFIX);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">投稿目录</h2>
        <p className="text-sm text-muted-foreground">
          选择稿件要放置的栏目，可在一级目录下新建二级栏目。
        </p>
      </div>

      <div className="space-y-2">
        <Label>选择栏目</Label>
        <TreeSelect
          className="w-full"
          treeData={options as DataNode[]}
          loading={loading}
          value={selectedKey || undefined}
          onChange={(val) => {
            setUserPicked(true);
            setSelectedKey((val as string) ?? "");
          }}
          showSearch
          treeNodeFilterProp="label"
          filterTreeNode={(input, node) =>
            String(node.label ?? "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          treeExpandedKeys={expandedKeys}
          onTreeExpand={(keys) => setExpandedKeys(keys as string[])}
          treeExpandAction="click"
          placeholder="请选择（可搜索）"
          allowClear
          treeLine
          listHeight={360}
          popupMatchSelectWidth={false}
          getPopupContainer={(trigger) =>
            trigger?.parentElement ?? document.body
          }
        />
        {suggestionApplied && suggestion?.reason ? (
          <p className="text-xs text-muted-foreground truncate">
            AI 建议：{suggestion.reason}
          </p>
        ) : null}
      </div>

      {needsSubdirName && (
        <div className="space-y-2">
          <Label>新建二级子栏目名称</Label>
          <Input
            placeholder="e.g. foundation-models"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            将创建路径：{selectedKey.split("/")[0]} /{" "}
            {sanitizedSubdir || "<未填写>"}
          </p>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        路径预览：
        <code className="ml-1 font-mono">{finalDirPath || "(未选择)"}</code>
      </div>
    </div>
  );
}
