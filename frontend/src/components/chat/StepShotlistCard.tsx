"use client";

import * as React from "react";
import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

import {
  Loader2,
  Download,
  ClipboardCopy,
  RotateCcw,
  AlertTriangle,
  Check,
  Wand2,
  ChevronDown,
  Music2,
  Clapperboard,
  Repeat,
  FileJson,
} from "lucide-react";

// NEW: Markdown editor
import EditableMarkdown from "@/components/editable-markdown";

/**
 * StepShotlistCard — UX-first + per-row TTS/Video actions
 *
 * ENV (nên đặt trong `.env.local`):
 * - NEXT_PUBLIC_API_BASE=http://localhost:8000
 * - NEXT_PUBLIC_API_SHOTLIST_PATH=/generate-shotlist
 * - NEXT_PUBLIC_API_TTS_PATH=/generate-voice
 * - NEXT_PUBLIC_API_VIDEO_PATH=/generate-video
 */

type Row = {
  beat: string;
  vo: string;
  primary_ost: string;
  annotation: string;
  pacing: string;
  prompt: string;
};

type Props = {
  className?: string;
  frameworkAnalysis: string;
  finalScript: string;
  report?: string;
  angleTitle?: string;
  angleRaw?: string;
  extraStylePrompt?: string;
  modelName?: string;
  apiPathOverride?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const API_SHOTLIST_PATH =
  process.env.NEXT_PUBLIC_API_SHOTLIST_PATH ?? "/generate-shotlist";
const API_TTS_PATH =
  process.env.NEXT_PUBLIC_API_TTS_PATH ?? "/generate-voice";
const API_VIDEO_PATH =
  process.env.NEXT_PUBLIC_API_VIDEO_PATH ?? "/generate-video";

/* ----------------------------- utils ----------------------------- */

// ===== Robust parsing utils (replaces previous parsing helpers) =====
const COLUMN_ALIASES: Record<string, keyof Row> = {
  // Beat
  "beat": "beat",
  "beat #": "beat",
  "#": "beat",
  "index": "beat",
  "no.": "beat",

  // VO
  "vo": "vo",
  "vo phrase": "vo",
  "vo phrase / sfx": "vo",
  "voice": "vo",
  "voice over": "vo",
  "sfx": "vo",

  // Primary OST
  "primary ost": "primary_ost",
  "overlay": "primary_ost",
  "overlay text": "primary_ost",
  "cover text": "primary_ost",
  "primary": "primary_ost",
  "ost": "primary_ost",

  // Annotation
  "annotation": "annotation",
  "annotation / sfx": "annotation",
  "sfx text": "annotation",
  "caption": "annotation",
  "sub": "annotation",

  // Pacing
  "pacing": "pacing",
  "pacing / notes": "pacing",
  "notes": "pacing",
  "tempo": "pacing",
  "style": "pacing",

  // Prompt
  "prompt": "prompt",
  "ai video generation prompt": "prompt",
  "shot prompt": "prompt",
};

function stripCodeFences(s: string) {
  if (!s) return "";
  let txt = s.trim();
  if (txt.startsWith("```")) txt = txt.replace(/^```[a-z0-9]*\s*/i, "");
  if (txt.endsWith("```")) txt = txt.slice(0, -3).trim();
  return txt;
}

function isMdSeparator(ln: string) {
  return /^\s*\|?\s*:?-{3,}\s*(\|\s*:?-{3,}\s*){1,}\|?\s*$/.test(ln);
}

function normalizeHeaderName(h: string) {
  return h.toLowerCase().replace(/\s+/g, " ").replace(/[._-]+/g, " ").trim();
}

function mapHeaderToField(h: string): keyof Row | null {
  const key = normalizeHeaderName(h);
  if (COLUMN_ALIASES[key]) return COLUMN_ALIASES[key];
  // Heuristics
  if (/^beat/.test(key) || key === "#" || /index|no/.test(key)) return "beat";
  if (/vo|voice|sfx/.test(key)) return "vo";
  if (/primary|overlay|cover|ost/.test(key)) return "primary_ost";
  if (/annotation|sfx/.test(key)) return "annotation";
  if (/pacing|notes|tempo|style/.test(key)) return "pacing";
  if (/prompt|shot\s*prompt/.test(key)) return "prompt";
  return null;
}

/** Tách theo delimiter, hỗ trợ giá trị có dấu ngoặc kép chứa ký tự phân tách */
function smartSplit(line: string, mode: "pipe" | "tab" | "space"): string[] {
  if (mode === "tab") return line.split("\t").map((c) => c.trim());

  if (mode === "pipe") {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"' && s[i - 1] !== "\\") {
        inQ = !inQ;
        continue;
      }
      if (ch === "|" && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out.map((c) => c.replace(/\\"/g, '"').trim());
  }

  // space mode: 2+ spaces, nhưng giữ nguyên cụm trong dấu "..."
  const toks: string[] = [];
  let cur = "";
  let inQ = false;
  const pushTok = () => {
    if (cur.length) toks.push(cur.trim());
    cur = "";
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") {
      inQ = !inQ;
      cur += ch;
      continue;
    }
    if (!inQ && /\s/.test(ch)) {
      let j = i;
      let spaces = 0;
      while (j < line.length && /\s/.test(line[j])) {
        spaces++;
        j++;
      }
      if (spaces >= 2) {
        pushTok();
        i = j - 1;
        continue;
      }
    }
    cur += ch;
  }
  pushTok();
  return toks.map((c) => c.replace(/^"(.*)"$/, "$1").trim());
}

function detectDelimiter(lines: string[]): "pipe" | "tab" | "space" {
  const sample = lines.slice(0, 40);
  const tabHits = sample.filter((l) => l.includes("\t")).length;
  const pipeHits = sample.filter((l) => /\|/.test(l)).length;
  const spaceHits = sample.filter((l) => /\S(\s{2,})\S/.test(l)).length;
  if (pipeHits >= tabHits && pipeHits >= spaceHits) return "pipe";
  if (tabHits >= spaceHits) return "tab";
  return "space";
}

function cleanBeat(val: string, i: number) {
  const s = (val || "").trim();
  if (!s) return String(i + 1);
  const m = s.match(/(\d+)/);
  if (m) return m[1];
  return s.replace(/^#\s*/, "") || String(i + 1);
}

function normalizeRowLen(arr: string[], want = 6) {
  const a = [...arr];
  if (a.length < want) while (a.length < want) a.push("");
  if (a.length > want) {
    a[want - 1] = a.slice(want - 1).join(" ").trim();
    return a.slice(0, want);
  }
  return a;
}

function parseAsTable(lines: string[]) {
  const filtered = lines.filter((ln) => !isMdSeparator(ln) && ln.trim() !== "");
  if (!filtered.length) return { rows: [] as Row[], ok: false, warning: "Empty table." };

  const mode = detectDelimiter(filtered);
  let headerIdx = -1;
  let headerCols: string[] = [];
  for (let idx = 0; idx < Math.min(10, filtered.length); idx++) {
    const cols = smartSplit(filtered[idx], mode);
    if (cols.length >= 6) {
      headerIdx = idx;
      headerCols = cols;
      break;
    }
  }
  if (headerIdx === -1) return { rows: [] as Row[], ok: false, warning: "No header with >=6 cols." };

  const mapIdxToField: (keyof Row | null)[] = headerCols.map(mapHeaderToField);
  const missing = ["beat", "vo", "primary_ost", "annotation", "pacing", "prompt"].filter(
    (k) => !mapIdxToField.includes(k as keyof Row)
  );
  const hasGoodHeader = missing.length === 0;

  const rows: Row[] = [];
  const dataLines = filtered.slice(headerIdx + 1);

  dataLines.forEach((ln, i) => {
    const colsRaw = smartSplit(ln, mode);
    const cols = normalizeRowLen(colsRaw, 6);
    let beat = "";
    let vo = "";
    let primary_ost = "";
    let annotation = "";
    let pacing = "";
    let prompt = "";

    if (hasGoodHeader) {
      cols.forEach((val, j) => {
        const f = mapIdxToField[j];
        if (!f) return;
        if (f === "beat") beat = val;
        else if (f === "vo") vo = val;
        else if (f === "primary_ost") primary_ost = val;
        else if (f === "annotation") annotation = val;
        else if (f === "pacing") pacing = val;
        else if (f === "prompt") prompt = val;
      });
    } else {
      [beat, vo, primary_ost, annotation, pacing, prompt] = cols;
    }

    beat = cleanBeat(beat, i);
    if ([vo, primary_ost, annotation, pacing, prompt].some((x) => x && x.trim())) {
      rows.push({
        beat,
        vo: vo.trim(),
        primary_ost: primary_ost.trim(),
        annotation: annotation.trim(),
        pacing: pacing.trim(),
        prompt: prompt.trim(),
      });
    }
  });

  const warning = hasGoodHeader ? "" : `Header columns not fully recognized (${missing.join(", ")}). Parsed by position.`;
  return { rows, ok: rows.length > 0, warning };
}

function parseFreeForm(raw: string) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const blocks: string[][] = [];
  let cur: string[] = [];
  const push = () => {
    if (cur.length) blocks.push(cur), (cur = []);
  };

  for (const ln of lines) {
    if (/\s\|\s/.test(ln)) {
      ln.split(/\s\|\s/).forEach((p) => cur.push(p));
      push();
    } else if (/^[A-Za-z# ]+:\s*/.test(ln)) {
      cur.push(ln);
      push();
    } else {
      if (!cur.length) cur.push(`Prompt: ${ln}`);
      else cur[cur.length - 1] += ` ${ln}`;
      push();
    }
  }

  const rows: Row[] = [];
  let idx = 0;
  for (const kvs of blocks) {
    const obj: Partial<Row> = {};
    for (const kv of kvs) {
      const m = kv.match(/^([A-Za-z# ]+):\s*(.*)$/);
      if (!m) continue;
      const k = normalizeHeaderName(m[1]);
      const v = m[2].trim();
      const field = mapHeaderToField(k) ?? (k.includes("overlay") ? "primary_ost" : null);
      if (!field) continue;
      // @ts-ignore
      obj[field] = v;
    }
    const beat = cleanBeat(String(obj.beat ?? ""), idx);
    const row: Row = {
      beat,
      vo: obj.vo?.trim() || "",
      primary_ost: obj.primary_ost?.trim() || "",
      annotation: obj.annotation?.trim() || "",
      pacing: obj.pacing?.trim() || "",
      prompt: obj.prompt?.trim() || "",
    };
    if ([row.vo, row.primary_ost, row.annotation, row.pacing, row.prompt].some(Boolean)) {
      rows.push(row);
      idx++;
    }
  }
  return { rows, ok: rows.length > 0, warning: rows.length ? "" : "Không nhận diện được form free-form." };
}

function parseShotlist(rawText: string): {
  rows: Row[];
  warning?: string;
} {
  const raw = stripCodeFences(rawText || "");
  if (!raw.trim()) return { rows: [] };

  const allLines = raw.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));

  const blocks: Array<[number, number]> = [];
  let i = 0;
  const looksTableLike = (ln: string) => {
    if (!ln?.trim()) return false;
    if (isMdSeparator(ln)) return true;
    return ln.includes("\t") || ln.split("|").length >= 3 || /\S(\s{2,})\S/.test(ln);
  };
  while (i < allLines.length) {
    if (looksTableLike(allLines[i])) {
      let j = i + 1;
      while (j < allLines.length && (looksTableLike(allLines[j]) || !allLines[j].trim())) j++;
      blocks.push([i, j]);
      i = j;
    } else i++;
  }

  if (blocks.length) {
    blocks.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    const [s, e] = blocks[0];
    const block = allLines.slice(s, e);
    const { rows, ok, warning } = parseAsTable(block);
    if (ok) return { rows, warning };
  }

  const ff = parseFreeForm(raw);
  return { rows: ff.rows, warning: ff.warning };
}

function rowsToTSV(rows: Row[]): string {
  return [
    "Beat #\tVO Phrase / SFX\tPrimary OST (Cover Text)\tAnnotation / SFX Text\tPacing / Notes\tAI Video Generation Prompt",
    ...rows.map((r) =>
      [r.beat, r.vo, r.primary_ost, r.annotation, r.pacing, r.prompt].join("\t")
    ),
  ].join("\n");
}

/** lấy url từ nhiều key khác nhau */
function pickUrl(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

/* -------------------------- component -------------------------- */

type RowAssets = {
  audioUrl?: string;
  audioDuration?: number;
  videoUrl?: string;
  aLoading?: boolean;
  vLoading?: boolean;
  aError?: string | null;
  vError?: string | null;
  poll_sec?: number; // NEW: poll_sec for each beat
};

export default function StepShotlistCard(props: Props) {
  const {
    className,
    frameworkAnalysis,
    finalScript,
    report,
    angleTitle,
    angleRaw,
    extraStylePrompt,
    modelName,
    apiPathOverride,
  } = props;

  const [fa, setFa] = useState(frameworkAnalysis);
  const [fs, setFs] = useState(finalScript);
  const [isLoading, setLoading] = useState(false);
  const [rawText, setRawText] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showJSON, setShowJSON] = useState(false);

  const apiShotlistPath = apiPathOverride || API_SHOTLIST_PATH;
  const fullShotlistUrl = `${API_BASE}${apiShotlistPath}`;

  const { rows, warning } = useMemo(() => parseShotlist(rawText), [rawText]);
  const parsedOk = rows.length > 0;

  const [assets, setAssets] = useState<Record<string, RowAssets>>({});
  const [shotlistJSON, setShotlistJSON] = useState<string>("");

  function setRowAssets(beat: string, patch: Partial<RowAssets>) {
    setAssets((s) => ({ ...s, [beat]: { ...(s[beat] || {}), ...patch } }));
  }

  useEffect(() => {
    if (parsedOk) {
      const jsonRows = rows.map((r) => ({
        ...r,
        poll_sec: assets[r.beat]?.poll_sec || 3, // Default poll_sec 3s, updated when audio is generated
      }));
      setShotlistJSON(JSON.stringify({ rows: jsonRows }, null, 2));
    } else {
      setShotlistJSON("");
    }
  }, [rows, assets, parsedOk]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setRawText("");
    setShowJSON(false);

    try {
      const payload = {
        framework_analysis: (fa ?? "").trim(),
        final_script: (fs ?? "").trim(),
        report: report ?? "",
        angle_title: angleTitle ?? "",
        angle_raw: angleRaw ?? "",
        extra_style_prompt: extraStylePrompt ?? "",
        model_name: modelName ?? "",
      };

      if (!payload.framework_analysis || !payload.final_script) {
        throw new Error("Vui lòng điền Framework Analysis và Final Video Script.");
      }

      const res = await fetch(fullShotlistUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = `Không thể tạo shotlist (HTTP ${res.status}).`;
        try {
          const j = await res.json();
          msg = typeof j?.detail === "string" ? j.detail : msg;
        } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      setModel(data?.model || "");
      const text = (data?.shotlist_text ?? "").toString();
      setRawText(text);
      setAssets({}); // reset media cache
    } catch (err: any) {
      setError(err?.message || "Không thể tạo shotlist. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMakeVoice(row: Row) {
    const beat = row.beat;
    setRowAssets(beat, { aLoading: true, aError: null });
    try {
      const res = await fetch(`${API_BASE}${API_TTS_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: row.vo, // chỉ VO
          beat: row.beat,
          style_hints: {
            pacing: row.pacing || "",
            annotation: row.annotation || "",
            primary_ost: row.primary_ost || "",
          },
        }),
      });
      if (!res.ok) {
        let msg = `Tạo voice thất bại (HTTP ${res.status}).`;
        try {
          const j = await res.json();
          msg = typeof j?.detail === "string" ? j.detail : msg;
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      const url =
        data?.audio_url ||
        data?.url ||
        data?.file ||
        data?.download_url ||
        data?.src ||
        "";
      if (!url) throw new Error("Không nhận được audio_url.");

      const audioDuration =
        typeof data?.duration_seconds === "number"
          ? data.duration_seconds
          : undefined;

      const poll_sec = audioDuration
        ? Math.max(2, Math.min(10, Math.round(audioDuration / 5)))
        : 3;

      setRowAssets(beat, {
        audioUrl: url,
        audioDuration,
        poll_sec,
      });
    } catch (e: any) {
      setRowAssets(beat, { aError: e?.message || "Không thể tạo voice." });
    } finally {
      setRowAssets(beat, { aLoading: false });
    }
  }

  async function handleMakeVideo(row: Row) {
    const beat = row.beat;
    setRowAssets(beat, { vLoading: true, vError: null });

    try {
      const A = assets[beat] || {};
      const voUrl = A.audioUrl ?? null;
      const voDur = A.audioDuration ?? null;
      const poll_sec = A.poll_sec ?? 3;

      const payload = {
        prompt: row.prompt,
        beat,
        vo_url: voUrl,
        vo_text: row.vo,
        duration_seconds: voDur ? Math.round(voDur) : undefined,
        overlay_text: row.primary_ost || "",
        annotation: row.annotation || "",
        pacing: row.pacing || "",
        aspect_ratio: "9:16",
        resolution: "720p",
        sample_count: 1,
        model_name: "veo-3.0-fast-generate-001",
        poll_sec,
      };

      const res = await fetch(`${API_BASE}${API_VIDEO_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = `Tạo video thất bại (HTTP ${res.status}).`;
        try {
          const j = await res.json();
          msg = typeof j?.detail === "string" ? j.detail : msg;
        } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      const url = pickUrl(data, [
        "video_url",
        "url",
        "file",
        "download_url",
        "src",
      ]) || "";
      if (!url) throw new Error("Không nhận được video_url.");

      setRowAssets(beat, { videoUrl: url });
    } catch (e: any) {
      setRowAssets(beat, { vError: e?.message || "Không thể tạo video." });
    } finally {
      setRowAssets(beat, { vLoading: false });
    }
  }

  function downloadResult(format: "tsv" | "txt" | "json") {
    let content = "";
    let name = "";
    let type = "text/plain;charset=utf-8";

    if (format === "tsv" && parsedOk) {
      content = rowsToTSV(rows);
      name = "shotlist.tsv";
      type = "text/tab-separated-values;charset=utf-8";
    } else if (format === "txt") {
      content = rawText || "";
      name = "shotlist.txt";
    } else if (format === "json" && parsedOk) {
      content = shotlistJSON;
      name = "shotlist.json";
      type = "application/json;charset=utf-8";
    } else {
      return;
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = name;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyTSV() {
    if (!parsedOk) return;
    const tsv = rowsToTSV(rows);
    navigator.clipboard.writeText(tsv);
  }

  function copyJSON() {
    if (shotlistJSON) {
      navigator.clipboard.writeText(shotlistJSON);
    }
  }

  function resetAll() {
    setRawText("");
    setModel("");
    setError(null);
    setShowErrorDetail(false);
    setShowAdvanced(false);
    setShowJSON(false);
    setAssets({});
    setShotlistJSON("");
  }

  return (
    <TooltipProvider>
      <Card className={cn("overflow-hidden shadow-lg", className)}>
        <CardHeader className="space-y-1 bg-muted/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Tạo AI Shot List</CardTitle>
              <CardDescription className="text-sm">
                Dán <em>Framework Analysis</em> và <em>Final Video Script</em>, nhấn “Tạo Shot List”.
              </CardDescription>
            </div>
            {parsedOk ? (
              <Badge variant="default" className="shrink-0">
                <Check className="mr-1 h-3.5 w-3.5" /> {rows.length} dòng
              </Badge>
            ) : null}
          </div>
          {warning ? (
            <div className="mt-2 text-xs text-amber-600">
              {warning}
            </div>
          ) : null}
        </CardHeader>

        <Separator />

        <CardContent className="grid gap-6 p-6">
          {/* Inputs */}
          <div className="grid gap-3">
            <EditableMarkdown
              value={fa}
              onChange={setFa}
              label="Framework Analysis"
              heightClass="h-[40dvh]"
            />
          </div>

          <div className="grid gap-3">
            <EditableMarkdown
              value={fs}
              onChange={setFs}
              label="Final Video Script"
              heightClass="h-[46dvh]"
              endAdornment={(
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFs((s) => s.trim())}
                      className="h-8 w-8"
                    >
                      <Wand2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Xoá khoảng trắng thừa</TooltipContent>
                </Tooltip>
              )}
            />
          </div>

          {/* Advanced context (collapsed) */}
          <div className="rounded-lg border bg-muted/30">
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/50 transition-colors"
              aria-expanded={showAdvanced}
            >
              <span>Nâng cao (tùy chọn)</span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", showAdvanced ? "rotate-180" : "")}
              />
            </button>
            {showAdvanced ? (
              <div className="grid gap-3 p-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Angle Title</Label>
                  <Input value={angleTitle ?? ""} readOnly placeholder="(optional)" />
                </div>
                <div className="grid gap-2">
                  <Label>Model</Label>
                  <Input value={modelName ?? ""} readOnly placeholder="(optional)" />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label>Angle Raw</Label>
                  <Textarea value={angleRaw ?? ""} readOnly placeholder="(optional)" className="min-h-[80px]" />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label>Extra Style Notes</Label>
                  <Textarea value={extraStylePrompt ?? ""} readOnly placeholder="(optional)" className="min-h-[80px]" />
                </div>
              </div>
            ) : null}
          </div>

          <Separator className="my-2" />

          {/* Controls */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleGenerate}
                  disabled={isLoading || !fa.trim() || !fs.trim()}
                  className="col-span-2 md:col-span-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang tạo…
                    </>
                  ) : (
                    <>Tạo Shot List</>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tạo shotlist từ inputs</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" onClick={() => downloadResult("tsv")} disabled={!parsedOk}>
                  <Download className="mr-2 h-4 w-4" />
                  TSV
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tải về định dạng TSV</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" onClick={() => downloadResult("txt")} disabled={!rawText}>
                  <Download className="mr-2 h-4 w-4" />
                  Raw
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tải về raw text</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" onClick={() => downloadResult("json")} disabled={!parsedOk}>
                  <FileJson className="mr-2 h-4 w-4" />
                  JSON
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tải về JSON shotlist</TooltipContent>
            </Tooltip>

            {parsedOk ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" onClick={copyTSV}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />
                    TSV
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sao chép TSV vào clipboard</TooltipContent>
              </Tooltip>
            ) : null}

            {parsedOk ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" onClick={copyJSON}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />
                    JSON
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sao chép JSON vào clipboard</TooltipContent>
              </Tooltip>
            ) : null}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetAll}
                  disabled={isLoading && !rawText}
                  className="col-span-2 md:col-span-1"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset tất cả</TooltipContent>
            </Tooltip>
          </div>

          {/* Error block */}
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="font-medium text-destructive">
                    Không thể tạo shotlist. Vui lòng kiểm tra nội dung đầu vào và thử lại.
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowErrorDetail((s) => !s)}
                    className="h-7"
                  >
                    {showErrorDetail ? "Ẩn chi tiết" : "Xem chi tiết"}
                  </Button>
                  {showErrorDetail ? (
                    <pre className="whitespace-pre-wrap break-words text-muted-foreground overflow-auto max-h-40">{error}</pre>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Results */}
          {parsedOk ? (
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Shot List</div>
                <div className="flex items-center gap-2">
                  {model ? <Badge variant="secondary">Model: {model}</Badge> : null}
                  <Badge variant="default">
                    <Check className="mr-1 h-3.5 w-3.5" /> {rows.length} dòng
                  </Badge>
                </div>
              </div>

              <ScrollArea className="h-[60vh] w-full rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-[64px]">Beat</TableHead>
                      <TableHead>VO Phrase / SFX</TableHead>
                      <TableHead>Primary OST</TableHead>
                      <TableHead>Annotation / SFX</TableHead>
                      <TableHead>Pacing</TableHead>
                      <TableHead className="min-w-[360px]">AI Video Generation Prompt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const A = assets[r.beat] || {};
                      return (
                        <TableRow key={r.beat}>
                          <TableCell className="font-medium">{r.beat}</TableCell>

                          {/* VO */}
                          <TableCell>
                            <div className="space-y-2">
                              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                {r.vo || <Badge variant="outline" className="text-[10px]">Trống</Badge>}
                              </div>
                              <div className="flex items-center gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant={A.audioUrl ? "outline" : "default"}
                                      onClick={() => handleMakeVoice(r)}
                                      disabled={!!A.aLoading}
                                      className="h-7"
                                    >
                                      {A.aLoading ? (
                                        <>
                                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                          Đang tạo…
                                        </>
                                      ) : A.audioUrl ? (
                                        <>
                                          <Repeat className="h-3.5 w-3.5 mr-1" />
                                          Tạo lại
                                        </>
                                      ) : (
                                        <>
                                          <Music2 className="h-3.5 w-3.5 mr-1" />
                                          Tạo voice
                                        </>
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{A.audioUrl ? "Tạo lại voice" : "Tạo voice (mp3)"}</TooltipContent>
                                </Tooltip>
                                {typeof A.audioDuration === "number" ? (
                                  <Badge variant="secondary" className="text-xs">
                                    ~{Math.round(A.audioDuration)}s
                                  </Badge>
                                ) : null}
                                {A.aError ? (
                                  <Badge variant="destructive" className="text-xs">
                                    {A.aError}
                                  </Badge>
                                ) : null}
                              </div>
                              {A.audioUrl ? (
                                <audio controls src={A.audioUrl} className="w-full" />
                              ) : null}
                            </div>
                          </TableCell>

                          {/* Primary OST */}
                          <TableCell>
                            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                              {r.primary_ost || <Badge variant="outline" className="text-[10px]">Trống</Badge>}
                            </div>
                          </TableCell>

                          {/* Annotation */}
                          <TableCell>
                            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                              {r.annotation || <Badge variant="outline" className="text-[10px]">Trống</Badge>}
                            </div>
                          </TableCell>

                          {/* Pacing */}
                          <TableCell>
                            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                              {r.pacing || <Badge variant="outline" className="text-[10px]">Trống</Badge>}
                            </div>
                          </TableCell>

                          {/* Prompt */}
                          <TableCell>
                            <div className="space-y-2">
                              <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
                                {r.prompt || "(no prompt)"}
                              </pre>
                              <div className="flex items-center gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant={A.videoUrl ? "outline" : "default"}
                                      onClick={() => handleMakeVideo(r)}
                                      disabled={!!A.vLoading}
                                      className="h-7"
                                    >
                                      {A.vLoading ? (
                                        <>
                                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                          Đang tạo…
                                        </>
                                      ) : A.videoUrl ? (
                                        <>
                                          <Repeat className="h-3.5 w-3.5 mr-1" />
                                          Tạo lại
                                        </>
                                      ) : (
                                        <>
                                          <Clapperboard className="h-3.5 w-3.5 mr-1" />
                                          Tạo video
                                        </>
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{A.videoUrl ? "Tạo lại video" : "Tạo video (mp4)"}</TooltipContent>
                                </Tooltip>
                                {A.poll_sec ? (
                                  <Badge variant="outline" className="text-xs">
                                    Poll: {A.poll_sec}s
                                  </Badge>
                                ) : null}
                                {A.vError ? (
                                  <Badge variant="destructive" className="text-xs">
                                    {A.vError}
                                  </Badge>
                                ) : null}
                              </div>
                              {A.videoUrl ? (
                                <video controls className="w-full rounded border" src={A.videoUrl} />
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="text-xs text-muted-foreground mt-2">
                Gợi ý: Tạo voice trước để tính poll_sec tối ưu, sau đó tạo video để đính kèm VO và đồng bộ tốt hơn.
              </div>

              {/* JSON section */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Shotlist JSON</div>
                  <Button variant="ghost" size="sm" onClick={() => setShowJSON((s) => !s)}>
                    {showJSON ? "Ẩn JSON" : "Xem JSON"}
                  </Button>
                </div>
                {showJSON && shotlistJSON ? (
                  <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-60 text-xs">
                    {shotlistJSON}
                  </pre>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="text-xs text-muted-foreground border-t p-4">
          <span>Mẹo: Shot List tốt nhất khi script được tách câu/ngắt nhịp rõ ràng.</span>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
