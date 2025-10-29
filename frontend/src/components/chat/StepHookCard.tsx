"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";

type Props = {
  loading: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onBack: () => void;
};

export default function StepHookCard({ loading, canGenerate, onGenerate, onBack }: Props) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] w-full">
        <Card className="p-4 rounded-2xl border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Hook Generator</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onBack}>Quay lại Script</Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            Hooks sẽ được tạo trực tiếp từ <strong>script hiện tại</strong>.
          </div>
          <div className="flex gap-2">
            <Button onClick={onGenerate} disabled={loading || !canGenerate}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Generate Hooks
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
