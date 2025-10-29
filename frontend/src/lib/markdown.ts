// lib/markdown.ts
// Shared (server/client) helpers to normalize messy text into clean Markdown
// - fixes line endings
// - converts lines of only *** --- ___ (3+) to a Markdown hr (---)
// - converts bullets starting with "* ", "• ", "+ ", "- " to unified "- "
// - preserves tables (lines with "|")
// - collapses excessive blank lines

export function normalizeMarkdown(input: string): string {
  let text = (input ?? "").replace(/\r\n?/g, "\n");

  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false; // do not touch inside ``` code fences

  for (let raw of lines) {
    let line = raw;

    // Toggle code fence state
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }

    if (!inFence) {
      const noSpace = line.replace(/\s+/g, "");
      const isTableRow = line.includes("|");

      // horizontal rule if the line is ONLY * _ - (3 or more), no table pipe
      if (!isTableRow && /^([*_\-]\s*){3,}$/.test(line.trim())) {
        out.push("---");
        continue;
      }

      // unify bullets at line start: *, •, + -> -
      if (/^\s*[\*•\+]-?\s+/.test(line)) {
        line = line.replace(/^\s*[\*•\+]-?\s+/, "- ");
      }

      // collapse multiple spaces around table pipes – but only for table rows
      if (isTableRow) {
        // keep as-is; optional: tidy spaces around pipes
        // line = line.replace(/\s*\|\s*/g, ' | ');
      }

      // trim trailing spaces (not in code blocks)
      line = line.replace(/\s+$/g, "");
    }

    out.push(line);
  }

  // collapse 3+ blank lines into 2, then into 1
  let joined = out.join("\n");
  joined = joined.replace(/\n{3,}/g, "\n\n");
  joined = joined.trimEnd();
  if (!joined.endsWith("\n")) joined += "\n";
  return joined;
}

export function slugifyFilename(name?: string): string {
  const base = (name || "doc").toString();
  // transliterate basic accents (light-weight, no deps)
  const from = "àáâäæãåāăąçćčđďèéêëēėęîïíīįìłñńôöòóœøōõßśšûüùúūýÿžźż·/_,:;";
  const to   = "aaaaaaaaaacccddeeeeeeeiiiiiiilnnoooooooosssuuuuuyyzzz------";
  let s = base
    .split("")
    .map((ch) => {
      const idx = from.indexOf(ch);
      return idx > -1 ? to[idx] : ch;
    })
    .join("");
  s = s
    .replace(/[^a-zA-Z0-9.\-\s]/g, "-") // remove weird chars
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();
  return s || "doc";
}

export function suggestFilename(base?: string) {
  const stamp = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const tag = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}`;
  const s = slugifyFilename(base);
  return s ? `${s}-${tag}` : `doc-${tag}`;
}
