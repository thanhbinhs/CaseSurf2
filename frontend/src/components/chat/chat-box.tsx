"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileVideo2,
  ChevronRight,
  RefreshCcw,
  Clapperboard,
  Sparkles,
} from "lucide-react";

import MessageBubble from "./MessageBubble";
import StepItem from "./StepItem";
import StepUploadCard from "./StepUploadCard";
import StepLandingCard from "./StepLandingCard";
import AnglesGrid from "./AnglesGrid";
import StepScriptCard from "./StepScriptCard";
import StepShotlistCard from "./StepShotlistCard";

import { Phase, MessageRole, ChatMessage, AngleFull } from "@/lib/chat/types";
import { apiLanding, apiReport, apiScript } from "@/lib/chat/api";
import { angleFromFreeText, extractVideoThumbnail } from "@/lib/chat/utils";

/* ======================= helpers ======================= */
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/* ======================= component ======================= */
export default function ChatBox({ className = "" }: { className?: string }) {
  const [phase, setPhase] = useState<Phase | "shotlist">("idle");

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      content: "Xin chào! Tải video MP4 và mô tả yêu cầu để mình phân tích nhé.",
    },
  ]);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoThumb, setVideoThumb] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [landingUrl, setLandingUrl] = useState("");

  const [report, setReport] = useState("");
  const [landingAnalysis, setLandingAnalysis] = useState("");
  const [anglesText, setAnglesText] = useState("");
  const [angles, setAngles] = useState<string[]>([]);
  const [anglesFull, setAnglesFull] = useState<AngleFull[]>([]);
  const [chosenAngle, setChosenAngle] = useState<string | null>(null);

  const [customAngle, setCustomAngle] = useState("");
  const [lastScript, setLastScript] = useState("");

  const [showLandingDetails, setShowLandingDetails] = useState(false);
  const [loading, setLoading] = useState<null | "report" | "landing" | "script">(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, phase]);

  useEffect(() => {
    (async () => {
      if (videoFile) setVideoThumb(await extractVideoThumbnail(videoFile));
      else setVideoThumb(null);
    })();
  }, [videoFile]);

  const pushMessage = useCallback(
    (role: MessageRole, content: string) =>
      setMessages((prev) => [...prev, { id: uid(), role, content }]),
    []
  );

  const resetAll = useCallback(() => {
    setPhase("idle");
    setMessages([
      { id: uid(), role: "assistant", content: "Xin chào! Tải video MP4 và mô tả yêu cầu để mình phân tích nhé." },
    ]);
    setVideoFile(null);
    setVideoThumb(null);
    setPrompt("");
    setLandingUrl("");
    setReport("");
    setLandingAnalysis("");
    setAnglesText("");
    setAngles([]);
    setAnglesFull([]);
    setChosenAngle(null);
    setError(null);
    setLoading(null);
    setCustomAngle("");
    setLastScript("");
    setShowLandingDetails(false);
  }, []);

  const redoLanding = useCallback(() => {
    setLandingAnalysis("");
    setAnglesText("");
    setAngles([]);
    setAnglesFull([]);
    setChosenAngle(null);
    setShowLandingDetails(false);
    setPhase("report");
  }, []);

  const redoScript = useCallback(() => {
    setChosenAngle(null);
    setCustomAngle("");
    setLastScript("");
    setPhase("landing");
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setVideoFile(f);
  };

  const step = useMemo(() => {
    switch (phase) {
      case "idle":
        return 1;
      case "report":
        return 2;
      case "landing":
        return 3;
      case "script":
        return 4;
      case "shotlist":
        return 5;
      default:
        return 1;
    }
  }, [phase]);

  /* ======================= actions ======================= */
  const handleAnalyzeVideo = useCallback(async () => {
    setError(null);
    if (!videoFile) return setError("Vui lòng chọn file MP4.");
    const userText = [videoFile ? `File: ${videoFile.name}` : "", prompt.trim()].filter(Boolean).join("\n\n");
    pushMessage("user", userText || "(no message)");
    setLoading("report");
    try {
      const r = await apiReport(videoFile, prompt.trim());
      setReport(r.report || "");
      pushMessage("assistant", `📄 **Report**\n\n${r.report || "—"}`);
      setPhase("report");
    } catch (e: any) {
      setError(e?.message || "Phân tích video thất bại");
    } finally {
      setLoading(null);
    }
  }, [videoFile, prompt, pushMessage]);

  const handleAnalyzeLanding = useCallback(async () => {
    setError(null);
    if (!landingUrl.trim()) return setError("Nhập URL hoặc nội dung landing page");
    pushMessage("user", `🔗 Phân tích landing page: ${landingUrl}`);
    setLoading("landing");
    try {
      const r = await apiLanding(landingUrl.trim());
      const la = r.landing_analysis || "";
      const at = r.angles_text || "";
      const full = (r.angles_full || []) as AngleFull[];
      const titles = full.length ? full.map((a) => a.title) : r.angles || [];
      setLandingAnalysis(la);
      setAnglesText(at);
      setAnglesFull(full);
      setAngles(titles);
      pushMessage("assistant", `🧾 **Đã nhận Landing Analysis** (ẩn mặc định)\n\nBấm \"Hiện phân tích\" trong thẻ bên dưới để xem.`);
      setPhase("landing");
    } catch (e: any) {
      setError(e?.message || "Phân tích landing page thất bại");
    } finally {
      setLoading(null);
    }
  }, [landingUrl, pushMessage]);

  const handleGenerateScript = useCallback(
    async (angle?: AngleFull | null, freeAngleText?: string) => {
      setError(null);
      let usedAngle: AngleFull | null | undefined = angle;
      if (!angle && freeAngleText?.trim()) usedAngle = angleFromFreeText(freeAngleText.trim());
      if (usedAngle) setChosenAngle(usedAngle.title); else setChosenAngle(null);
      pushMessage("user", usedAngle ? `✍️ Tạo script với angle: ${usedAngle.title}` : `✍️ Tạo script với angle mới (tự nhập)`);
      setLoading("script");
      try {
        const r = await apiScript(report, landingAnalysis, usedAngle ?? null, anglesText);
        setLastScript(r.script || "");
        pushMessage("assistant", `📜 **Script**\n\n${r.script || "—"}`);
        setPhase("script");
      } catch (e: any) {
        setError(e?.message || "Tạo script thất bại");
      } finally {
        setLoading(null);
      }
    },
    [report, landingAnalysis, anglesText, pushMessage]
  );

  const handleProceedShotlist = useCallback(() => {
    if (!lastScript.trim()) return setError("Chưa có FINAL VIDEO SCRIPT.");
    setError(null);
    pushMessage("user", "🎬 Tạo Shot List từ Final Video Script");
    setPhase("shotlist");
  }, [lastScript, pushMessage]);

  /* ======================= UI atoms ======================= */
  const Trail = (
    <div className="hidden md:flex items-center gap-2 text-[11px]">
      <TechPill label="Upload" active={step >= 1} done={step > 1} />
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
      <TechPill label="Report" active={step >= 2} done={step > 2} />
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
      <TechPill label="Landing" active={step >= 3} done={step > 3} />
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
      <TechPill label="Script" active={step >= 4} done={step > 4} />
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
      <TechPill label="Shot List" active={step >= 5} />
    </div>
  );

  return (
    <div className={`relative h-full w-full ${className}`}>
      {/* BG tech grid + gradient glow */}
      <TechBackground />

      <Card className="relative h-full w-full flex flex-col border border-border/60 bg-background/70 backdrop-blur-xl shadow-[0_0_0_1px_rgb(255_255_255_/_0.02)]">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 h-14 border-b bg-gradient-to-r from-background/60 via-background/40 to-background/60">
          <div className="flex items-center gap-2">
            <div className="relative">
              <motion.div
                className="absolute -inset-1 rounded-xl bg-gradient-to-r from-violet-500/50 via-cyan-500/40 to-fuchsia-500/50 blur-md"
                animate={{ opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
              <div className="relative rounded-xl p-1.5 bg-background/70 ring-1 ring-white/10">
                <FileVideo2 className="h-5 w-5" />
              </div>
            </div>
            <div className="text-sm font-semibold tracking-wide">Video Intelligence</div>
            <div className="ml-2 hidden md:flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              <span>AI workflow</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Trail}
            <Button size="icon" variant="ghost" onClick={resetAll} aria-label="Reset" title="Reset toàn bộ">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <ScrollArea ref={scrollRef as any} className="flex-1">
          <div className="p-4 space-y-4">
            {/* Chat messages */}
            <motion.div layout className="space-y-2">
              {messages.map((m) => (
                <motion.div key={m.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <MessageBubble role={m.role} content={m.content} />
                </motion.div>
              ))}
            </motion.div>

            {/* Step: Upload */}
            {phase === "idle" && (
              <StepUploadCard
                videoThumb={videoThumb}
                videoFile={videoFile}
                setVideoFile={setVideoFile}
                prompt={prompt}
                setPrompt={setPrompt}
                loading={loading === "report"}
                onAnalyze={handleAnalyzeVideo}
                onDrop={onDrop}
              />
            )}

            {/* Step: Report -> Landing */}
            {phase === "report" && (
              <StepLandingCard
                landingUrl={landingUrl}
                setLandingUrl={setLandingUrl}
                loading={loading === "landing"}
                error={error}
                onAnalyze={handleAnalyzeLanding}
                onRedo={redoLanding}
                showDetails={showLandingDetails}
                setShowDetails={setShowLandingDetails}
                landingAnalysis={landingAnalysis}
              />
            )}

            {/* Step: Landing (analysis + angle picker) */}
            {phase === "landing" && (
              <>
                <StepLandingCard
                  landingUrl={landingUrl}
                  setLandingUrl={setLandingUrl}
                  loading={loading === "landing"}
                  error={error}
                  onAnalyze={handleAnalyzeLanding}
                  onRedo={redoLanding}
                  showDetails={showLandingDetails}
                  setShowDetails={setShowLandingDetails}
                  landingAnalysis={landingAnalysis}
                />
                <AnglesGrid angles={angles} anglesFull={anglesFull} onPick={(a) => handleGenerateScript(a)} />
              </>
            )}

            {/* Step: Script + CTA to Shotlist */}
            {phase === "script" && (
              <>
                <StepScriptCard
                  customAngle={customAngle}
                  setCustomAngle={setCustomAngle}
                  loadingScript={loading === "script"}
                  onGenerateWithCustom={() => handleGenerateScript(null, customAngle)}
                  onPickAgain={() => setPhase("landing")}
                  onRedoScript={redoScript}
                  angles={angles}
                  anglesFull={anglesFull}
                  onPickAngle={(a) => handleGenerateScript(a)}
                  canHook={false}
                  onHook={() => {}}
                />

                {lastScript.trim() && (
                  <Card className="p-4 rounded-2xl border shadow-sm bg-gradient-to-br from-background/80 to-background">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Bước tiếp theo</div>
                      <div className="flex gap-2">
                        <Button variant="default" onClick={handleProceedShotlist} title="Sinh Shot List từ Script">
                          <Clapperboard className="mr-2 h-4 w-4" />
                          Tạo Shot List từ Script
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* Step: Shotlist */}
            {phase === "shotlist" && (
              <Card className="p-4 rounded-2xl border shadow-sm">
                <StepShotlistCard
                  finalScript={lastScript || ""}
                  frameworkAnalysis={landingAnalysis || ""}
                  report={report || ""}
                  angleTitle={(anglesFull.find((a) => a.title === chosenAngle)?.title) || ""}
                  angleRaw={(anglesFull.find((a) => a.title === chosenAngle)?.raw) || ""}
                />
                <div className="mt-3 flex justify-between">
                  <Button variant="outline" onClick={() => setPhase("script")}>← Quay lại Script</Button>
                </div>
              </Card>
            )}

            {/* Loading message bubble */}
            {loading && (
              <MessageBubble
                role="assistant"
                content={
                  loading === "report"
                    ? "Đang phân tích video…"
                    : loading === "landing"
                    ? "Đang phân tích landing page…"
                    : "Đang tạo script…"
                }
              />
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Footer */}
        <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <span>Tip: Kéo thả video trực tiếp vào thẻ Upload ở trên.</span>
          )}
          <span className="hidden md:inline">⌘K — Quick actions (tuỳ bạn bind)</span>
        </div>
      </Card>
    </div>
  );
}

/* ======================= tech-styled atoms ======================= */
function TechPill({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  const state = done ? "done" : active ? "active" : "idle";
  const cls =
    state === "done"
      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20"
      : state === "active"
      ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30"
      : "bg-muted/40 text-muted-foreground ring-1 ring-white/5";
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      <span>{label}</span>
    </div>
  );
}

function TechBackground() {
  return (
    <>
      {/* soft radial glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]">
        <div className="absolute -top-24 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-gradient-to-tr from-violet-500/20 via-cyan-500/20 to-fuchsia-500/20 blur-3xl" />
      </div>
      {/* subtle grid */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.15]">
        <div className="h-full w-full [background-image:linear-gradient(to_right,rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>
    </>
  );
}
