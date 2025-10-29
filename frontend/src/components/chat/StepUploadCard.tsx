"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, Play, Loader2, Sparkles, Image as ImageIcon } from "lucide-react";
import { fmtBytes } from "@/lib/chat/utils";
import { cn } from "@/lib/utils";

/**
 * Tech-styled StepUploadCard
 * - Same props/behavior as your original component
 * - Adds neon grid, drag highlight, and a polished file capsule
 */

type Props = {
  videoThumb: string | null;
  videoFile: File | null;
  setVideoFile: (f: File | null) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  loading: boolean;
  onAnalyze: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
};

export default function StepUploadCardTech({
  videoThumb,
  videoFile,
  setVideoFile,
  prompt,
  setPrompt,
  loading,
  onAnalyze,
  onDrop,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="flex justify-start">
      <div className="w-full md:max-w-[80%]">
        <Card className="relative overflow-hidden rounded-2xl border bg-background/70 backdrop-blur-xl">
          {/* subtle tech grid bg */}
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12]">
            <div className="h-full w-full [background-image:linear-gradient(to_right,rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:22px_22px]" />
          </div>

          <div className="flex flex-col md:flex-row">
            {/* Thumbnail */}
            <div className="md:w-64 p-3 md:p-4 flex items-center justify-center">
              <div className="relative w-full overflow-hidden rounded-xl ring-1 ring-white/10 bg-muted/40">
                <div className="aspect-video w-full">
                  {videoThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={videoThumb} alt="thumbnail" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <ImageIcon className="h-6 w-6" />
                      <span className="text-xs">Chưa có thumbnail</span>
                    </div>
                  )}
                </div>
                {/* glow */}
                <div className="pointer-events-none absolute -inset-px rounded-xl ring-1 ring-white/10" />
              </div>
            </div>

            {/* Right content */}
            <div className="flex-1 p-4 md:p-5 grid gap-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">Tải video & mô tả yêu cầu</div>
                <Badge variant="secondary" className="hidden md:inline-flex gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> AI-ready
                </Badge>
              </div>

              {/* Dropzone */}
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPicker()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  setDragOver(false);
                  onDrop(e);
                }}
                onClick={openPicker}
                className={cn(
                  "group rounded-xl border border-dashed p-4 transition-all cursor-pointer",
                  "bg-muted/30 hover:bg-muted/40",
                  dragOver && "border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_0_2px_rgba(34,211,238,0.25)]"
                )}
                aria-label="Kéo thả hoặc chọn tệp video"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    dragOver ? "bg-cyan-500/15 ring-1 ring-cyan-400/30" : "bg-muted"
                  )}>
                    <Upload className={cn("h-4 w-4", dragOver && "animate-bounce")} />
                  </div>

                  <div className="flex-1">
                    <div className="font-medium">Kéo & thả video MP4 vào đây</div>
                    <div className="text-xs text-muted-foreground">hoặc bấm để chọn tệp từ máy</div>
                  </div>

                  {videoFile ? (
                    <div className="shrink-0 max-w-[220px]">
                      <div className="truncate text-sm font-medium">{videoFile.name}</div>
                      <div className="text-xs text-muted-foreground">{fmtBytes(videoFile.size)}</div>
                    </div>
                  ) : null}
                </div>
                <input
                  ref={inputRef}
                  id="video-input-hidden"
                  type="file"
                  accept="video/mp4,video/*"
                  className="hidden"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                />
              </div>

              {/* Prompt */}
              <div className="grid gap-2">
                <Label className="text-xs">Mô tả yêu cầu phân tích video</Label>
                <Textarea
                  placeholder="Ví dụ: Trích insight chính, đề xuất CTA, highlight thành phần…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-20"
                />
                <div className="flex items-center gap-2">
                  <Button onClick={onAnalyze} disabled={loading || !videoFile}>
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Phân tích video
                  </Button>
                  {videoFile ? (
                    <Badge variant="outline" className="text-[11px]">Sẵn sàng phân tích</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] text-muted-foreground">Chưa chọn video</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
