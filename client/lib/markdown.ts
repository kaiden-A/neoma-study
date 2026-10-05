export interface MdState {
  value: string;
  start: number;
  end: number;
}

export interface MdEdit {
  value: string;
  start: number;
  end: number;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
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

function lineSpan(value: string, start: number, end: number): { from: number; to: number; lines: string[] } {
  const safeStart = Math.min(start, value.length);
  const safeEnd = Math.min(Math.max(end, safeStart), value.length);
  const from = value.lastIndexOf("\n", Math.max(0, safeStart - 1)) + 1;
  const newline = value.indexOf("\n", safeEnd);
  const to = newline === -1 ? value.length : newline;
  return { from, to, lines: value.slice(from, to).split("\n") };
}

const BLOCK_PREFIX = /^(?:[-*+]\s+|\d{1,3}[.)]\s+|#{1,6}\s+|>\s?)/;

export function wrapSelection(state: MdState, before: string, after = before): MdEdit {
  const { value, start, end } = state;
  const selected = value.slice(start, end);
  const outerBefore = value.slice(Math.max(0, start - before.length), start);
  const outerAfter = value.slice(end, end + after.length);
  if (outerBefore === before && outerAfter === after) {
    return {
      value: value.slice(0, start - before.length) + selected + value.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    };
  }
  if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  return {
    value: `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`,
    start: start + before.length,
    end: end + before.length,
  };
}

function setLinePrefix(state: MdState, match: RegExp, build: (index: number) => string): MdEdit {
  const { from, to, lines } = lineSpan(state.value, state.start, state.end);
  const active = lines.some((line) => line.trim()) && lines.every((line) => !line.trim() || match.test(line));
  let counter = 0;
  const next = lines
    .map((line) => {
      if (!line.trim()) return line;
      const bare = line.replace(BLOCK_PREFIX, "");
      if (active) return bare;
      counter += 1;
      return `${build(counter - 1)}${bare}`;
    })
    .join("\n");
  return {
    value: state.value.slice(0, from) + next + state.value.slice(to),
    start: from,
    end: from + next.length,
  };
}

export function toggleHeading(state: MdState, level: number): MdEdit {
  const hash = "#".repeat(level);
  return setLinePrefix(state, new RegExp(`^${hash}\\s`), () => `${hash} `);
}

export function toggleBulletList(state: MdState): MdEdit {
  return setLinePrefix(state, /^[-*+]\s/, () => "- ");
}

export function toggleOrderedList(state: MdState): MdEdit {
  return setLinePrefix(state, /^\d{1,3}[.)]\s/, (index) => `${index + 1}. `);
}

export function toggleChecklist(state: MdState): MdEdit {
  return setLinePrefix(state, /^[-*+]\s\[[ xX]\]\s/, () => "- [ ] ");
}

export function insertTable(state: MdState): MdEdit {
  const block = [
    "| Column 1 | Column 2 | Column 3 |",
    "| --- | --- | --- |",
    "|  |  |  |",
    "|  |  |  |",
  ].join("\n");
  const prefix = state.value.slice(0, state.start);
  const suffix = state.value.slice(state.end);
  const lead = prefix && !prefix.endsWith("\n") ? "\n\n" : "";
  const trail = suffix && !suffix.startsWith("\n") ? "\n\n" : "\n";
  const headerStart = prefix.length + lead.length + 2;
  return {
    value: `${prefix}${lead}${block}${trail}${suffix}`,
    start: headerStart,
    end: headerStart + "Column 1".length,
  };
}

export function insertImage(state: MdState, alt = "alt text"): MdEdit {
  const selected = state.value.slice(state.start, state.end);
  const trimmed = selected.trim();
  if (trimmed && /^https?:\/\/\S+$/i.test(trimmed)) {
    const text = `![${alt}](${trimmed})`;
    return { value: state.value.slice(0, state.start) + text + state.value.slice(state.end), start: state.start + 2, end: state.start + 2 + alt.length };
  }
  const label = trimmed || alt;
  const url = "https://";
  const text = `![${label}](${url})`;
  if (selected) {
    const urlStart = state.start + 3 + label.length;
    return { value: state.value.slice(0, state.start) + text + state.value.slice(state.end), start: urlStart, end: urlStart + url.length };
  }
  return { value: state.value.slice(0, state.start) + text + state.value.slice(state.end), start: state.start + 2, end: state.start + 2 + label.length };
}

function insertAfter(state: MdState, text: string): MdEdit {
  return {
    value: state.value.slice(0, state.start) + text + state.value.slice(state.end),
    start: state.start + text.length,
    end: state.start + text.length,
  };
}

function removeLine(state: MdState, from: number, line: string): MdEdit {
  return {
    value: state.value.slice(0, from) + state.value.slice(from + line.length),
    start: from,
    end: from,
  };
}

export function continueList(state: MdState): MdEdit | null {
  const { from, lines } = lineSpan(state.value, state.start, state.start);
  const line = lines[0] ?? "";
  const checklist = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s*(.*)$/);
  if (checklist) {
    return checklist[4].trim()
      ? insertAfter(state, `\n${checklist[1]}${checklist[2]} [ ] `)
      : removeLine(state, from, line);
  }
  const bullet = line.match(/^(\s*)([-*+])\s+(.*)$/);
  if (bullet) {
    return bullet[3].trim() ? insertAfter(state, `\n${bullet[1]}${bullet[2]} `) : removeLine(state, from, line);
  }
  const ordered = line.match(/^(\s*)(\d{1,3})[.)]\s+(.*)$/);
  if (ordered) {
    return ordered[3].trim()
      ? insertAfter(state, `\n${ordered[1]}${Number(ordered[2]) + 1}. `)
      : removeLine(state, from, line);
  }
  return null;
}

export function isListLine(value: string, position: number): boolean {
  const { lines } = lineSpan(value, position, position);
  return /^\s*(?:[-*+]\s|\d{1,3}[.)]\s)/.test(lines[0] ?? "");
}

export function indentSelection(state: MdState, outdent = false): MdEdit {
  const { from, to, lines } = lineSpan(state.value, state.start, state.end);
  const shift = (line: string): number => {
    if (!line.trim()) return 0;
    if (!outdent) return 2;
    if (line.startsWith("  ")) return -2;
    if (line.startsWith("\t")) return -1;
    return 0;
  };
  const next = lines
    .map((line) => {
      const delta = shift(line);
      if (delta === 2) return `  ${line}`;
      if (delta < 0) return line.slice(-delta);
      return line;
    })
    .join("\n");
  const moved = (pos: number): number => {
    if (pos < from) return pos;
    let result = pos;
    let lineStart = from;
    while (lineStart <= pos) {
      let lineEnd = state.value.indexOf("\n", lineStart);
      if (lineEnd === -1) lineEnd = state.value.length;
      result += shift(state.value.slice(lineStart, lineEnd));
      if (lineEnd >= pos) break;
      lineStart = lineEnd + 1;
    }
    return Math.max(from, result);
  };
  return {
    value: state.value.slice(0, from) + next + state.value.slice(to),
    start: moved(state.start),
    end: moved(state.end),
  };
}
