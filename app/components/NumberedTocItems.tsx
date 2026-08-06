"use client";

import { useRef } from "react";
import * as Primitive from "fumadocs-core/toc";
import type { TOCItemType } from "fumadocs-core/server";
import { useTOCItems } from "fumadocs-ui/components/layout/toc";
import { TocThumb } from "fumadocs-ui/components/layout/toc-thumb";
import { cn } from "@/lib/utils";

// 编号从该文档实际存在的最浅 depth 起算：remarkShiftHeadingIfH1 会整体
// 平移 heading 树，不同文档的顶层 depth 不固定，不能写死 depth 2 = 一级
function numberItems(
  items: TOCItemType[],
): { item: TOCItemType; number: string }[] {
  const stack: { depth: number; count: number }[] = [];
  return items.map((item) => {
    while (stack.length > 0 && stack[stack.length - 1].depth > item.depth) {
      stack.pop();
    }
    const top = stack[stack.length - 1];
    if (top !== undefined && top.depth === item.depth) {
      top.count += 1;
    } else {
      stack.push({ depth: item.depth, count: 1 });
    }
    return { item, number: stack.map((level) => level.count).join(".") };
  });
}

export function NumberedTocItems() {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = useTOCItems();
  if (items.length === 0) return null;

  const minDepth = Math.min(...items.map((item) => item.depth));

  return (
    <>
      <TocThumb
        containerRef={containerRef}
        className="absolute top-(--fd-top) h-(--fd-height) w-px bg-fd-primary transition-all"
      />
      <div
        ref={containerRef}
        className="flex flex-col border-s border-fd-foreground/10"
      >
        {numberItems(items).map(({ item, number }) => {
          const level = item.depth - minDepth;
          return (
            <Primitive.TOCItem
              key={item.url}
              href={item.url}
              className={cn(
                "prose py-1.5 text-sm text-fd-muted-foreground transition-colors [overflow-wrap:anywhere] first:pt-0 last:pb-0 data-[active=true]:text-fd-primary",
                level <= 0 && "ps-3",
                level === 1 && "ps-6",
                level >= 2 && "ps-8",
              )}
            >
              <span className="me-1.5 tabular-nums">{number}</span>
              {item.title}
            </Primitive.TOCItem>
          );
        })}
      </div>
    </>
  );
}
