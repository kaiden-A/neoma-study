const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeUrl(value: string): string | null {
  const raw = decodeHtml(value.trim());
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function renderInline(raw: string): string {
  const tokens: string[] = [];
  const stash = (html: string): string => `\u0000${tokens.push(html) - 1}\u0000`;
  let text = escapeHtml(raw).replace(/\u0000/g, "");
  text = text.replace(/`([^`]+)`/g, (_match, code: string) => stash(`<code>${code}</code>`));
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt: string, href: string) => {
    const url = safeUrl(href);
    return url ? stash(`<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy" />`) : match;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
    const url = safeUrl(href);
    return url
      ? stash(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`)
      : match;
  });
  text = text.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "<strong>$2</strong>");
  text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  text = text.replace(/(\*|_)(?=\S)([^*_]*?\S)\1/g, "<em>$2</em>");
  return text.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => tokens[Number(index)] ?? "");
}

const FENCE = /^```\w*\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const CHECK = /^\[([ xX])\]\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/;

function isTableStart(lines: string[], index: number): boolean {
  const row = lines[index];
  const next = lines[index + 1];
  return Boolean(row && next && row.includes("|") && TABLE_SEP.test(next));
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index];
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    isTableStart(lines, index)
  );
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines: string[], index: number): [string, number] {
  const header = splitRow(lines[index]);
  let i = index + 2;
  const rows: string[][] = [];
  while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
    rows.push(splitRow(lines[i]));
    i += 1;
  }
  const head = header.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${header.map((_, col) => `<td>${renderInline(row[col] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return [`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`, i];
}

interface ListNode {
  indent: number;
  ordered: boolean;
  checked: boolean | null;
  html: string;
}

function collectList(lines: string[], index: number): [ListNode[], number] {
  const items: ListNode[] = [];
  let i = index;
  while (i < lines.length) {
    const line = lines[i];
    const bullet = line.match(BULLET);
    const ordered = bullet ? null : line.match(ORDERED);
    if (!bullet && !ordered) break;
    const indent = (bullet ?? ordered)![1].length;
    const orderedList = Boolean(ordered);
    let text = (bullet ?? ordered)![3];
    let checked: boolean | null = null;
    if (!orderedList) {
      const check = text.match(CHECK);
      if (check) {
        checked = check[1].toLowerCase() === "x";
        text = check[2];
      }
    }
    items.push({ indent, ordered: orderedList, checked, html: renderInline(text) });
    i += 1;
  }
  return [items, i];
}

function renderLevel(items: ListNode[], start: number, indent: number): [string, number] {
  const tag = items[start].ordered ? "ol" : "ul";
  let html = `<${tag}>`;
  let i = start;
  while (i < items.length && items[i].indent >= indent) {
    const item = items[i];
    if (item.indent > indent) {
      const [child, next] = renderLevel(items, i, item.indent);
      html += `<li>${child}</li>`;
      i = next;
      continue;
    }
    const marker =
      item.checked === null ? "" : `<input type="checkbox" disabled${item.checked ? " checked" : ""} /> `;
    const cls = item.checked === null ? "" : ` class="nm-md-task${item.checked ? " is-done" : ""}"`;
    let inner = `${marker}${item.html}`;
    i += 1;
    while (i < items.length && items[i].indent > indent) {
      const [child, next] = renderLevel(items, i, items[i].indent);
      inner += child;
      i = next;
    }
    html += `<li${cls}>${inner}</li>`;
  }
  return [`${html}</${tag}>`, i];
}

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const quote = lines[i].match(QUOTE);
        if (!quote) break;
        body.push(quote[1]);
        i += 1;
      }
      out.push(`<blockquote>${renderBlocks(body)}</blockquote>`);
      continue;
    }
    if (isTableStart(lines, i)) {
      const [html, next] = renderTable(lines, i);
      out.push(html);
      i = next;
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      const [items, next] = collectList(lines, i);
      out.push(renderLevel(items, 0, items[0].indent)[0]);
      i = next;
      continue;
    }
    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${paragraph.map(renderInline).join("<br />")}</p>`);
  }
  return out.join("\n");
}

export function renderMarkdown(value: string): string {
  const source = String(value ?? "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
  if (!source.trim()) return "";
  return renderBlocks(source.split("\n"));
}

export function stripMarkdown(value: string): string {
  let text = String(value ?? "");
  text = text.replace(/```\w*\n?([\s\S]*?)```/g, "$1");
  text = text.replace(/`([^`]*)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s{0,3}([-*+]|\d{1,3}[.)])\s+(\[[ xX]\]\s+)?/gm, "");
  text = text.replace(/^\s*\|?[\s:|-]+\|[\s:|-]*\s*$/gm, "");
  text = text.replace(/\|/g, " ");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm, "");
  return text;
}
