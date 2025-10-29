"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AngleFull } from "@/lib/chat/types";

type Props = {
  angles: string[];
  anglesFull: AngleFull[];
  onPick: (angle: AngleFull) => void;
};

// --- Tiny helpers ------------------------------------------------------------
function safe(s?: string | null): string {
  return (s ?? "").toString().trim();
}

// Rút trích nhẹ các field từ raw nếu BE chưa parse:
// Hỗ trợ các nhãn phổ biến: "Target Persona", "Persona", "Core Message", "Story Arc", "CTA"
function hydrateFromRaw(a: AngleFull): AngleFull {
  const raw = safe((a as any).raw);
  if (!raw) return a;

  const grab = (labels: string[]) => {
    const pat = new RegExp(
      `(?:^|\\n)\\s*(?:${labels.join("|")})\\s*[:\\-–]\\s*([^\\n]+)`,
      "i"
    );
    const m = raw.match(pat);
    return m ? m[1].trim() : "";
  };

  const persona =
    safe((a as any).persona) ||
    grab(["Target\\s*Persona", "Persona"]);
  const core_message =
    safe((a as any).core_message) ||
    grab(["Core\\s*Message", "Key\\s*Message"]);
  const arc =
    safe((a as any).story_arc) ||
    safe((a as any).arc) ||
    grab(["Story\\s*Arc", "PAS", "AIDA"]);
  const cta =
    safe((a as any).cta) ||
    grab(["CTA", "Call\\s*to\\s*Action"]);

  return {
    ...a,
    // Đính các field đã rút trích vào object trả về (không làm thay đổi type gốc)
    // @ts-ignore - lưu tạm để UI dùng
    persona,
    // @ts-ignore
    core_message,
    // @ts-ignore
    arc,
    // @ts-ignore
    cta,
  };
}

function makeItems(angles: string[], anglesFull: AngleFull[]): AngleFull[] {
  const base =
    anglesFull?.length
      ? anglesFull
      : (angles || []).map((t) => ({ title: t } as AngleFull));
  return base.map(hydrateFromRaw);
}

// Lấy đoạn mô tả ngắn cho card
function shortDesc(a: any): string {
  return (
    safe(a.core_message) ||
    safe(a.hook) ||
    safe(a.persona) ||
    safe(a.raw)
  );
}

// -----------------------------------------------------------------------------

export default function AnglesGrid({ angles, anglesFull, onPick }: Props) {
  const items = useMemo(() => makeItems(angles, anglesFull), [angles, anglesFull]);

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] w-full">
        <div className="text-sm font-medium mb-2">Chọn 1 angle để tạo script</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((a, idx) => {
            const title = safe((a as any).title) || `Angle ${a.number ?? idx + 1}`;
            const persona = safe((a as any).persona);
            const core = safe((a as any).core_message);
            const arc = safe((a as any).arc);
            const cta = safe((a as any).cta);
            const raw = safe((a as any).raw);

            return (
              <Card
                key={`${title}-${idx}`}
                className="p-4 rounded-2xl border shadow-sm flex flex-col"
              >
                {/* Title */}
                <div className="text-sm font-semibold mb-1 break-words line-clamp-2">
                  {title}
                </div>

                {/* Quick summary */}
                <div className="text-xs text-muted-foreground mb-3 break-words line-clamp-4">
                  {shortDesc(a)}
                </div>

                {/* Meta badges */}
                <div className="mt-auto flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">Angle</Badge>
                  {persona && (
                    <Badge variant="outline" className="truncate max-w-[160px]">
                      {persona}
                    </Badge>
                  )}
                  {arc && (
                    <Badge variant="outline" className="truncate max-w-[140px]">
                      {arc}
                    </Badge>
                  )}
                </div>

                {/* Key fields (compact) */}
                {(core || cta) && (
                  <div className="mt-3 space-y-1 text-xs">
                    {core && (
                      <div className="flex gap-1">
                        <span className="font-medium shrink-0">Core:</span>
                        <span className="text-muted-foreground break-words line-clamp-2">
                          {core}
                        </span>
                      </div>
                    )}
                    {cta && (
                      <div className="flex gap-1">
                        <span className="font-medium shrink-0">CTA:</span>
                        <span className="text-muted-foreground break-words line-clamp-2">
                          {cta}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Raw preview (details) */}
                {raw && (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-xs text-primary underline decoration-dotted hover:opacity-90">
                      Xem chi tiết
                    </summary>
                    <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto border rounded-md p-2">
                      {raw}
                    </div>
                  </details>
                )}

                <Button className="mt-3" onClick={() => onPick(a)}>
                  Dùng angle này
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
