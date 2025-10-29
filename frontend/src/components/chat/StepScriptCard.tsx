"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import {
  Loader2,
  Wand2,
  Undo2,
  ChevronLeft,
  Sparkles,
  Info,
  Check,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

import AnglesGrid from "./AnglesGrid";
import type { AngleFull } from "@/lib/chat/types";

type Props = {
  angles: string[];
  anglesFull: AngleFull[];
  customAngle: string;
  setCustomAngle: (val: string) => void;

  loadingScript: boolean;
  onGenerateWithCustom: () => void;
  onPickAngle: (angle: AngleFull) => void;

  onPickAgain: () => void;
  onRedoScript: () => void;

  canHook?: boolean;
  onHook?: () => void;
};

export default function StepScriptCard({
  angles,
  anglesFull,
  customAngle,
  setCustomAngle,
  loadingScript,
  onGenerateWithCustom,
  onPickAngle,
  onPickAgain,
  onRedoScript,
  canHook = false,
  onHook,
}: Props) {
  const disabled = loadingScript;

  const stats = useMemo(() => {
    const chars = customAngle.length;
    const words = (customAngle.trim().match(/\S+/g) || []).length;
    return { chars, words };
  }, [customAngle]);

  const angleTemplates = [
    {
      k: "pas",
      label: "Template PAS",
      text:
        "Angle Title: [Tên góc ngắn, punchy]\n" +
        "Target Persona: [Ai sẽ bị hút vào góc này?]\n" +
        "Core Message: [Ý chính trong ≤ 30s]\n" +
        "Story Arc (PAS):\n" +
        "  • Problem — [Nỗi đau cụ thể]\n" +
        "  • Agitate — [Khuấy động cảm xúc/hậu quả]\n" +
        "  • Solution — [Sản phẩm/USP giải quyết]\n" +
        "CTA: [Hành động kết thúc]",
    },
    {
      k: "aida",
      label: "Template AIDA",
      text:
        "Angle Title: [Tên góc ngắn, punchy]\n" +
        "Target Persona: [Nhóm người xem]\n" +
        "Core Message: [Ý chính trong ≤ 30s]\n" +
        "Story Arc (AIDA):\n" +
        "  • Attention — [Gây chú ý: shock/secret/stat/story]\n" +
        "  • Interest — [Lợi ích hoặc bối cảnh vấn đề]\n" +
        "  • Desire — [Kết quả/transform mong muốn]\n" +
        "  • Action — [CTA rõ ràng]\n" +
        "CTA: [Hành động kết thúc]",
    },
  ];

  function pasteTemplate(t: string) {
      if (disabled) return;
      if (!customAngle) {
        setCustomAngle(t);
        return;
      }
      setCustomAngle(`${customAngle.trim()}\n\n${t}`.trim());
    }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Bước 3 — Viết kịch bản từ Angle</h3>
          <p className="text-sm text-muted-foreground">
            Chọn một Angle có sẵn hoặc nhập Angle tuỳ chỉnh để tạo{" "}
            <em>Final Video Script</em>. Bạn có thể viết lại script hoặc tạo Hook sau khi có kịch bản.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="secondary">
              Có sẵn: <b className="mx-1">{anglesFull?.length ?? 0}</b> góc
            </Badge>
            <Badge variant="outline">
              Tuỳ chỉnh: {stats.words} từ • {stats.chars} ký tự
            </Badge>
            {loadingScript ? (
              <Badge variant="default" className="gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Đang tạo script
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3.5 w-3.5" />
                Sẵn sàng
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPickAgain}
            disabled={disabled}
            title="Quay lại bước trước"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Chọn lại Angle
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onRedoScript}
            disabled={disabled}
            title="Viết lại script với cùng Angle"
          >
            <Undo2 className="h-4 w-4 mr-1" />
            Viết lại
          </Button>

          {canHook && (
            <Button
              size="sm"
              onClick={onHook}
              disabled={disabled}
              title="Tạo Hook gợi mở cho kịch bản này"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Tạo Hook
            </Button>
          )}
        </div>
      </div>

      {/* Info helper */}
      <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground flex gap-2">
        <Info className="h-4 w-4 mt-0.5" />
        <div>
          <b>Mẹo:</b> Trong Angle nên có <b>Persona</b>, <b>Core Message</b>, <b>Story Arc</b> (PAS/AIDA) và <b>CTA</b>.
          Hãy dùng mẫu dưới đây để điền nhanh — mô hình sẽ viết kịch bản bám sát nội dung bạn cung cấp.
        </div>
      </div>

      {/* Chọn Angle có sẵn */}
      <Card className="p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Chọn 1 Angle có sẵn</h4>
          {disabled && (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Đang tạo script…
            </div>
          )}
        </div>

        {anglesFull && anglesFull.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Gợi ý được kết xuất từ Landing Analysis. Nhấn{" "}
              <span className="font-medium">“Dùng angle này”</span> để sinh kịch bản.
            </p>
            <AnglesGrid
              angles={angles}
              anglesFull={anglesFull}
              onPick={(angle) => {
                if (!disabled) onPickAngle(angle);
              }}
            />
          </>
        ) : (
          <EmptyAngleState />
        )}
      </Card>

      {/* Nhập Angle tuỳ chỉnh */}
      <Card className="p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Hoặc nhập Angle tuỳ chỉnh</h4>
          <div className="text-xs text-muted-foreground">
            {stats.words} từ • {stats.chars} ký tự
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {angleTemplates.map((t) => (
            <Button
              key={t.k}
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => pasteTemplate(t.text)}
              disabled={disabled}
            >
              {t.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setCustomAngle("")}
            disabled={disabled || !customAngle}
            title="Xoá nội dung angle tuỳ chỉnh"
          >
            Làm trống
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom-angle">Angle tuỳ chỉnh</Label>
          <Textarea
            id="custom-angle"
            value={customAngle}
            onChange={(e) => setCustomAngle(e.target.value)}
            placeholder="Ví dụ: 
Angle Title: Ultra Pure DHA cho mẹ bầu/sau sinh
Target Persona: Health-Conscious Planner
Core Message: Tập trung lợi ích trí não & thị lực cho bé
Story Arc (PAS|AIDA): ...
CTA: Nhận mã giảm 15% hôm nay"
            className="min-h-[140px] resize-y"
            disabled={disabled}
          />
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              Gợi ý: ghi rõ <span className="font-medium">Persona</span>,{" "}
              <span className="font-medium">Core Message</span>,{" "}
              <span className="font-medium">Arc (PAS/AIDA)</span>,{" "}
              <span className="font-medium">CTA</span>.
            </p>
            <Button
              onClick={onGenerateWithCustom}
              disabled={disabled || !customAngle.trim()}
              title="Tạo script từ angle nhập"
            >
              {disabled ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang tạo…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Tạo script từ angle nhập
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Footer helper */}
      <div className="text-xs text-muted-foreground leading-relaxed">
        Sau khi kịch bản được tạo, bạn có thể quay về chỉnh Angle hoặc dùng chức năng{" "}
        <span className="font-medium">Viết lại</span> để có phiên bản khác giữ cùng định hướng.
      </div>
    </div>
  );
}

/* ---------------------------- Sub components ---------------------------- */

function EmptyAngleState() {
  return (
    <div className="rounded-lg border bg-background p-6 text-center">
      <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
        <Info className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="font-medium">Chưa có gợi ý Angle</div>
      <p className="text-sm text-muted-foreground mt-1">
        Hãy đảm bảo bạn đã chạy bước <b>Landing Analysis</b>. 
        Hoặc sử dụng khung <b>Template</b> bên dưới để nhập Angle tuỳ chỉnh.
      </p>
      <Separator className="my-4" />
      <div className="text-xs text-muted-foreground">
        Mẹo: Hãy nêu rõ vấn đề, lợi ích, USP, và CTA mong muốn. Mô hình sẽ bám sát khi viết kịch bản.
      </div>
    </div>
  );
}
