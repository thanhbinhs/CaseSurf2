"use client";

import * as React from "react";
import { useMemo, useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Copy, Eye, Pencil, SplitSquareHorizontal, Wand2 } from "lucide-react";
import MarkdownLite from "@/components/markdown-lite";

// Thêm imports cho Tiptap
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown"; // Giả sử đã install tiptap-markdown
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight"; // Giả sử install lowlight cho syntax highlighting
import TiptapEditor from "./TiptapEditor";

// Create a lowlight instance for syntax highlighting
const lowlight = createLowlight();

export type EditableMarkdownProps = {
  /** current markdown text */
  value: string;
  /** called whenever user edits */
  onChange: (next: string) => void;
  /** optional label shown above */
  label?: string;
  /** optional right-side adornment */
  endAdornment?: React.ReactNode;
  /** fixed height for editor/preview area (e.g. "h-[50dvh]") */
  heightClass?: string;
  /** className to style the wrapper */
  className?: string;
  /** enable a simple tidy action (trim trailing spaces, collapse blanks) */
  enableTidy?: boolean;
};

/**
 * A light-weight, zero-dep Markdown editor with live preview.
 * Modes: Write / Preview / Split
 * Cải thiện: Sử dụng Tiptap cho phần Write và Split để edit với rendering Markdown thời gian thực (WYSIWYG) và syntax highlighting.
 */
export default function EditableMarkdown({
  value,
  onChange,
  label,
  endAdornment,
  heightClass = "h-[46dvh]",
  className,
  enableTidy = true,
}: EditableMarkdownProps) {
  // derived: word/char count (cheap)
  const counts = useMemo(() => {
    const chars = value?.length ?? 0;
    const words = (value?.trim().match(/\b\w+\b/g)?.length ?? 0);
    return { chars, words };
  }, [value]);

  function tidy() {
    const lines = (value || "").split(/\r?\n/).map((l) => l.replace(/\s+$/g, ""));
    const collapsed = lines.join("\n").replace(/\n{3,}/g, "\n\n");
    onChange(collapsed.trim());
  }

  function copyAll() {
    navigator.clipboard.writeText(value || "");
  }

  return (
    <div className={cn("rounded-lg border", className)}>
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          {label ? <div className="text-sm font-medium">{label}</div> : null}
          <Badge variant="secondary" className="hidden md:inline-flex">{counts.words} words</Badge>
        </div>
        <div className="flex items-center gap-1">
          {endAdornment}
          <Button type="button" size="icon" variant="ghost" title="Copy" onClick={copyAll}>
            <Copy className="h-4 w-4" />
          </Button>
          {enableTidy ? (
            <Button type="button" size="icon" variant="ghost" title="Tidy" onClick={tidy}>
              <Wand2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <Separator />

      <Tabs defaultValue="write" className="w-full">
        <div className="flex items-center justify-between px-3 py-2">
          <TabsList>
            <TabsTrigger value="write" className="gap-1">
              <Pencil className="h-3.5 w-3.5" /> Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1">
              <Eye className="h-3.5 w-3.5" /> Preview
            </TabsTrigger>
            <TabsTrigger value="split" className="gap-1">
              <SplitSquareHorizontal className="h-3.5 w-3.5" /> Split
            </TabsTrigger>
          </TabsList>
          <div className="text-xs text-muted-foreground">Markdown support: **bold**, *italic*, `code`, tables, lists, code blocks with highlighting…</div>
        </div>

        {/* WRITE: Sử dụng Tiptap editor với Markdown rendering và highlighting */}
        <TabsContent value="write" className="px-3 pb-3">
          <TiptapEditor
            value={value}
            onChange={onChange}
            heightClass={heightClass}
          />
        </TabsContent>

        {/* PREVIEW */}
        <TabsContent value="preview" className="px-3 pb-3">
          <div className={cn("rounded-md border bg-muted/30 p-3 overflow-auto", heightClass)}>
            <MarkdownLite text={value || "_Nothing to preview_"} className="prose prose-sm max-w-none" />
          </div>
        </TabsContent>

        {/* SPLIT: Bên trái Tiptap editor, bên phải preview */}
        <TabsContent value="split" className="px-3 pb-3">
          <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", heightClass)}>
            <TiptapEditor
              value={value}
              onChange={onChange}
              heightClass="h-full"
            />
            <div className="rounded-md border bg-muted/30 p-3 overflow-auto h-full">
              <MarkdownLite text={value || "_Nothing to preview_"} className="prose prose-sm max-w-none" />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}