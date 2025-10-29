"use client";

import React, { useMemo } from "react";

export type MarkdownLiteProps = {
  text: string;
  className?: string;
  heightClass?: string; // e.g. "h-[70dvh]"
};

/* ======================= helpers (safe) ======================= */

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHr(line: string) {
  return /^\s*([*_\-]\s*){3,}\s*$/.test(line);
}

function isTableLine(line: string) {
  // đơn giản: có ký tự | và không phải code fence
  return /\|/.test(line) && !/^\s*```/.test(line);
}

function inlineToHtml(raw: string) {
  // 1) escape toàn bộ
  let s = escapeHtml(raw);

  // 2) Bảo vệ code span bằng placeholder trước khi xử lý bold/italic/links/images
  const codeMap: Record<string, string> = {};
  let codeIdx = 0;
  s = s.replace(/`([^`]+)`/g, (_, g1: string) => {
    const key = `%%CODE_${codeIdx++}%%`;
    codeMap[key] =
      `<code class="px-1 py-0.5 rounded bg-muted text-foreground/90">${g1}</code>`;
    return key;
  });

  // 3) Images ![alt](url)
  s = s.replace(
    /!\[([^\]]*)\]\((https?:[^\s)]+)\)/g,
    (_m, alt: string, url: string) =>
      `<img src="${url}" alt="${alt}" class="max-w-full rounded" />`
  );

  // 4) Link markdown: [text](https://...)
  s = s.replace(
    /\[([^\]]+)\]\((https?:[^\s)]+)\)/g,
    (_m, g1: string, g2: string) =>
      `<a href="${g2}" target="_blank" rel="noopener noreferrer nofollow" class="underline">${g1}</a>`
  );

  // 5) bare urls (http/https)
  s = s.replace(
    /(?<!["\w])(https?:\/\/[^\s<]+[^<.,;\s])/g,  // avoid starting with " or word to prevent nesting
    (_m, g1: string) =>
      `<a href="${g1}" target="_blank" rel="noopener noreferrer nofollow" class="underline">${g1}</a>`
  );

  // 6) bold **...** hoặc __...__
  s = s.replace(
    /(\*\*([^*]+)\*\*)|(__([^_]+)__)/g,
    (_m, _m1, g2, _m3, g4) => `<strong>${g2 ?? g4 ?? ""}</strong>`
  );

  // 7) italic *...* hoặc _..._ (không ăn vào strong đã render)
  s = s.replace(
    /(^|[^*_])(?:\*([^*]+)\*|_([^_]+)_)/g,
    (_m, lead: string, g2: string, g3: string) =>
      `${lead}<em>${g2 ?? g3 ?? ""}</em>`
  );

  // 8) gạch ngang ~~...~~
  s = s.replace(/~~([^~]+)~~/g, (_m, g1: string) => `<s>${g1}</s>`);

  // 9) highlight ==...==
  s = s.replace(/==([^=]+)==/g, (_m, g1: string) => `<mark class="bg-yellow-200">${g1}</mark>`);

  // 10) Trả lại code
  s = s.replace(/%%CODE_\d+%%/g, (m) => codeMap[m] || m);

  return s;
}

function buildTableHtml(lines: string[]) {
  // chuẩn hóa và cắt pipes đầu/cuối
  const rows = lines
    .map((l) => l.trim())
    .map((l) => l.replace(/^\|/, "").replace(/\|$/, ""))
    .map((l) => l.split("|").map((c) => c.trim()));

  // Nếu không có separator, treat first row as header nếu có >=2 rows
  let header: string[] | null = rows[0];
  let aligns: ("left" | "right" | "center")[] = rows[0].map(() => "left");
  let startRow = 1;
  if (
    rows.length >= 2 &&
    rows[1].every((c) => /^:?-{3,}:?$/.test(c || ""))
  ) {
    aligns = rows[1].map((c) =>
      c.startsWith(":") && c.endsWith(":")
        ? "center"
        : c.endsWith(":")
        ? "right"
        : "left"
    );
    startRow = 2;
  } else {
    // No separator: still use first as header
  }

  const thead = header
    ? `<thead><tr>${header
        .map((h, i) => {
          const ta = aligns[i] ?? "left";
          return `<th class="px-2 py-1 text-${ta} border-b">${inlineToHtml(
            h
          )}</th>`;
        })
        .join("")}</tr></thead>`
    : "";

  const tbody = `<tbody>${rows
    .slice(startRow)
    .map((r) => {
      return `<tr>${r
        .map((c, i) => {
          const ta = aligns[i] ?? "left";
          return `<td class="px-2 py-1 align-top text-${ta} border-b">${inlineToHtml(
            c
          )}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("")}</tbody>`;

  return `<table class="w-full text-sm border-collapse">${thead}${tbody}</table>`;
}

/* ======================= renderer ======================= */

function renderMarkdownLite(src: string) {
  const text = (src ?? "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  let html: string[] = [];
  let i = 0;
  let inCode = false;
  let codeLang = "";

  let listStack: { type: "ul" | "ol"; html: string[]; indent: number }[] = [];

  let blockquote: string[] | null = null;
  const paraBuf: string[] = [];

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    const joined = buf.join(" ");
    html.push(`<p class="my-2 leading-relaxed">${inlineToHtml(joined)}</p>`);
    buf.length = 0;
  };

  const flushLists = () => {
    while (listStack.length) {
      const current = listStack.pop()!;
      const items = current.html.join("");
      const klass =
        current.type === "ul"
          ? "list-disc marker:text-muted-foreground"
          : "list-decimal";
      const listStr = `<${current.type} class="my-2 pl-5 ${klass}">${items}</${current.type}>`;
      if (listStack.length) {
        listStack[listStack.length - 1].html.push(listStr);
      } else {
        html.push(listStr);
      }
    }
  };

  const flushBlockquote = () => {
    if (!blockquote) return;
    const content = blockquote.map((l) => inlineToHtml(l)).join("<br/>");
    html.push(
      `<blockquote class="my-2 border-l-2 pl-3 italic text-muted-foreground">${content}</blockquote>`
    );
    blockquote = null;
  };

  const getIndent = (line: string) => line.length - line.trimStart().length;

  while (i < lines.length) {
    let line = lines[i];

    // fenced code
    const fence = line.match(/^\s*```(\w+)?\s*$/);
    if (fence) {
      flushParagraph(paraBuf);
      flushLists();
      flushBlockquote();
      if (!inCode) {
        inCode = true;
        codeLang = fence[1] || "";
        const langClass = codeLang ? ` language-${codeLang}` : "";
        html.push(
          `<pre class="my-2 rounded bg-muted p-3 overflow-x-auto"><code class="${langClass}">`
        );
      } else {
        inCode = false;
        codeLang = "";
        html.push(`</code></pre>`);
      }
      i++;
      continue;
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      i++;
      continue;
    }

    // blank line → kết thúc paragraph/list/blockquote
    if (!line.trim()) {
      flushParagraph(paraBuf);
      flushLists();
      flushBlockquote();
      i++;
      continue;
    }

    // horizontal rule
    if (isHr(line)) {
      flushParagraph(paraBuf);
      flushLists();
      flushBlockquote();
      html.push('<hr class="my-3" />');
      i++;
      continue;
    }

    // ATX headings: #..#### (giữ tối đa h4 để gọn UI)
    const hx = line.match(/^\s*(#{1,6})\s+(.+)\s*$/);
    if (hx) {
      const level = Math.min(hx[1].length, 4);
      const content = inlineToHtml(hx[2]);
      flushParagraph(paraBuf);
      flushLists();
      flushBlockquote();
      const sizes = {
        1: "text-xl font-semibold",
        2: "text-lg font-semibold",
        3: "text-base font-semibold",
        4: "text-sm font-semibold",
      } as Record<number, string>;
      html.push(
        `<h${level} class="mt-3 mb-1 ${sizes[level]}">${content}</h${level}>`
      );
      i++;
      continue;
    }

    // blockquote
    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      flushParagraph(paraBuf);
      flushLists();
      blockquote = blockquote || [];
      blockquote.push(bq[1]);
      i++;
      continue;
    } else if (blockquote) {
      flushBlockquote();
    }

    // table block
    if (isTableLine(line)) {
      flushParagraph(paraBuf);
      flushLists();
      flushBlockquote();
      const tbl: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        tbl.push(lines[i]);
        i++;
      }
      html.push(buildTableHtml(tbl));
      continue;
    }

    // lists (with nested support)
    const indent = getIndent(line);
    const ulm = line.match(/^\s*[\-\*\+•]\s+(.+)$/);
    const olm = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (ulm || olm) {
      flushParagraph(paraBuf);
      flushBlockquote();
      const newType = ulm ? "ul" : "ol";
      const content = ulm ? ulm[1] : olm?.[2] ?? "";

      // Pop stacks until matching indent
      while (listStack.length && indent <= listStack[listStack.length - 1].indent) {
        const popped = listStack.pop()!;
        const items = popped.html.join("");
        const klass =
          popped.type === "ul"
            ? "list-disc marker:text-muted-foreground"
            : "list-decimal";
        const listStr = `<${popped.type} class="my-2 pl-5 ${klass}">${items}</${popped.type}>`;
        if (listStack.length) {
          listStack[listStack.length - 1].html.push(`<li class="my-1">${listStr}</li>`);
        } else {
          html.push(listStr);
        }
      }

      // Push new list if needed
      if (!listStack.length || indent > listStack[listStack.length - 1].indent || newType !== listStack[listStack.length - 1].type) {
        listStack.push({ type: newType, html: [], indent });
      }

      listStack[listStack.length - 1].html.push(`<li class="my-1">${inlineToHtml(content)}</li>`);
      i++;
      continue;
    } else {
      flushLists();
    }

    // default: paragraph (gộp dòng)
    paraBuf.push(line.trim());
    i++;
  }

  // flush tail
  flushParagraph(paraBuf);
  flushLists();
  flushBlockquote();

  return html.join("");
}

/* ======================= component ======================= */

export default function MarkdownLite({
  text,
  className = "",
  heightClass = "h-auto",
}: MarkdownLiteProps) {
  const html = useMemo(() => renderMarkdownLite(text), [text]);
  return (
    <div className={`markdown-lite text-sm ${heightClass} overflow-auto ${className}`}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <style jsx>{`
        .markdown-lite table { border-collapse: collapse; width: 100%; }
        .markdown-lite th, .markdown-lite td { border-bottom: 1px solid hsl(var(--border)); }
        .markdown-lite code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 0.9em;
        }
        .markdown-lite pre code {
          display: block;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .markdown-lite a:hover { text-decoration: underline; }
        .markdown-lite img { max-width: 100%; height: auto; }
        .markdown-lite mark { background-color: hsl(var(--warning)); padding: 0.1em 0.2em; }
      `}</style>
    </div>
  );
}