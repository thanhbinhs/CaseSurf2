import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import { cn } from "@/lib/utils";

const lowlight = createLowlight();

function TiptapEditor({
  value,
  onChange,
  heightClass,
}: {
  value: string;
  onChange: (next: string) => void;
  heightClass: string;
}) {
  // Tránh SSR hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Nhớ markdown cuối để chống loop setContent <-> onUpdate
  const lastMdRef = useRef<string>(value ?? "");

  // Khởi tạo editor — KHÔNG render content ngay trên server
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({
        html: false,
        tightLists: true,
      }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    immediatelyRender: false,
    content: "", // sẽ set sau khi client mounted
    onUpdate: ({ editor }: { editor: Editor }) => {
      // Lấy Markdown từ storage của tiptap-markdown
      const md = (editor as any)?.storage?.markdown?.getMarkdown?.() as string | undefined;
      const next = (md ?? "").toString();
      if (next !== lastMdRef.current) {
        lastMdRef.current = next;
        onChange(next);
      }
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm focus:outline-none max-w-none p-3 font-mono text-[13px] leading-6",
      },
    },
  });

  // Đồng bộ giá trị ban đầu sau khi mounted
  useEffect(() => {
    if (!mounted || !editor) return;
    const current =
      ((editor as any)?.storage?.markdown?.getMarkdown?.() as string | undefined) ??
      editor.getText() ??
      "";
    if (current !== (value ?? "")) {
      editor.commands.setContent(value || "", { emitUpdate: false });
      lastMdRef.current = value || "";
    }
  }, [mounted, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cập nhật khi prop `value` thay đổi từ bên ngoài
  useEffect(() => {
    if (!editor || !mounted) return;
    if ((value ?? "") !== lastMdRef.current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
      lastMdRef.current = value || "";
    }
  }, [value, editor, mounted]);

  return (
    <div className={cn("rounded-md border bg-background", heightClass)}>
      {mounted && editor ? (
        <EditorContent editor={editor} className="h-full overflow-auto" />
      ) : (
        // Fallback tạm trong SSR/chưa mount
        <div className="h-full overflow-auto p-3 text-xs text-muted-foreground whitespace-pre-wrap">
          {value}
        </div>
      )}
    </div>
  );
}

export default TiptapEditor;
