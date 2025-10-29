"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2, Send } from "lucide-react";
import MarkdownLite from "@/components/markdown-lite";
import { useState } from "react"; // Thêm import nếu cần cho state bổ sung, nhưng hiện tại không cần
import { Label } from "@/components/ui/label"; // Thêm Label cho accessibility
import { cn } from "@/lib/utils"; // Giả sử có utils cho classnames, nếu không thì remove cn và dùng className thủ công

type Props = {
  landingUrl: string;
  setLandingUrl: (v: string) => void;
  loading: boolean;
  error?: string | null;
  onAnalyze: () => void;
  onRedo: () => void;

  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  landingAnalysis: string;
};

export default function StepLandingCard({
  landingUrl, setLandingUrl, loading, error, onAnalyze, onRedo,
  showDetails, setShowDetails, landingAnalysis
}: Props) {
  return (
    <div className="flex justify-start w-full">
      <div className="w-full max-w-md"> {/* Giới hạn max-width để responsive tốt hơn */}
        <Card className="p-6 border shadow-md rounded-xl"> {/* Tăng padding cho không gian thoáng hơn */}
          <div className="flex items-center justify-between mb-4"> {/* Tăng margin bottom */}
            <div className="text-base font-semibold">Phân tích Landing Page</div> {/* Tăng font size nhẹ */}
            <div className="flex gap-3"> {/* Tăng gap giữa buttons */}
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setShowDetails(!showDetails)}
                className="text-muted-foreground hover:text-foreground" 
              >
                {showDetails ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" /> {/* Tăng mr */}
                    Ẩn phân tích
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Hiện phân tích
                  </>
                )}
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={onRedo}
                className="border-primary text-primary hover:bg-primary/10" 
              >
                Làm lại bước Landing
              </Button>
            </div>
          </div>

          <form 
            onSubmit={(e) => { e.preventDefault(); onAnalyze(); }} 
            className="flex flex-col gap-4" 
          >
            <div className="space-y-1"> {/* Thêm label wrapper */}
              <Label htmlFor="landing-url" className="text-sm font-medium">URL Landing Page</Label>
              <div className="relative">
                <Input 
                  id="landing-url"
                  placeholder="https://example.com" 
                  value={landingUrl} 
                  onChange={(e) => setLandingUrl(e.target.value)} 
                  className="pr-10"
                  disabled={loading} 
                />
                {/* Có thể thêm icon URL nếu muốn, nhưng giữ đơn giản */}
              </div>
            </div>
            <Button 
              type="submit" 
              disabled={loading || !landingUrl.trim()} 
              className="w-full sm:w-auto" 
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Phân tích
            </Button>
          </form>

          {error && <p className="text-sm text-destructive mt-3">{error}</p>} {/* Tăng font size và margin */}

          {showDetails && landingAnalysis && (
            <div className={cn(
              "mt-4 max-h-[50vh] overflow-y-auto p-4 bg-muted/50 rounded-lg transition-all duration-300",
              showDetails ? "opacity-100" : "opacity-0" // Thêm transition mượt mà
            )}>
              <MarkdownLite text={landingAnalysis} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}