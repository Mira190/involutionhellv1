/**
 * 正常 HTML/JSX 标签匹配模式（用于 negative lookahead）：
 *   - 可选 `/` 表示闭合标签 (</div>)
 *   - 标签名首字母为字母，后跟字母/数字/冒号/下划线/连字符
 *   - 可选属性段：空格后跟任意非尖括号字符（[^<>] 防 ReDoS）
 *   - 可选 `/` 表示自闭合 (<br />)
 *   - `>` 收尾
 *
 * 接受样例（lookahead 命中，不 escape）：
 *   <div>           </div>         <br />
 *   <img src="..." />              <a href="x" title="y">
 *   <Component prop="val" />
 *
 * 不接受样例（lookahead miss，进 escape 分支）：
 *   <8>             <1,2,3>        <x, y>         <string, number>
 */
const VALID_TAG_LOOKAHEAD = /\/?[A-Za-z][A-Za-z0-9:_-]*([ \t][^<>]*)?\s*\/?>/;

/**
 * 极简策略：
 * 1) 跳过 fenced code / inline code（保留原样）
 * 2) 仅在普通文本行内转义形如 <数字开头...> 或 <单词里含逗号/空格/数学符号...> 的片段
 * 3) 不动像 <Component> / <div> / <img src="..." />（含属性）这类"正常标签"
 */
export function escapeSuspiciousAngles(src: string): string {
  // 粗粒度：把代码块剥离（防止误替换），留下占位符
  const blocks: string[] = [];
  let out = src.replace(/```[\s\S]*?```/g, (m) => {
    blocks.push(m);
    return `__CODE_BLOCK_${blocks.length - 1}__`;
  });

  // 行内代码也剥离
  out = out.replace(/`[^`]*`/g, (m) => {
    blocks.push(m);
    return `__CODE_BLOCK_${blocks.length - 1}__`;
  });

  // 在普通文本里做"可疑尖括号"的转义：
  //  - <\d...>  如 <8>、<1,2,3>
  //  - <[^\s/>][^>]*[,;+\-*/= ]+[^>]*>  含明显非标签符号的
  out = out
    .replace(/<\d[^>]*>/g, (m) =>
      m.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    )
    .replace(new RegExp(`<(?!${VALID_TAG_LOOKAHEAD.source})[^>]*>`, "g"), (m) =>
      m.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    );

  // 还原占位的代码块/行内代码
  return out.replace(/__CODE_BLOCK_(\d+)__/g, (_, i) => blocks[Number(i)]);
}
