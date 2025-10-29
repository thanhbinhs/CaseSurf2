import { AngleFull, HookResp, LandingResp, ReportResp, ScriptResp } from "./types";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

export async function apiReport(file: File, message: string): Promise<ReportResp> {
  const fd = new FormData();
  fd.append("video", file);
  fd.append("message", message);
  fd.append("userId", "demo-user");
  fd.append("projectId", "demo-project");
  const res = await fetch(`${API}/analysis-report`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiLanding(url: string): Promise<LandingResp> {
  const fd = new FormData();
  fd.append("landingUrl", url);
  fd.append("userId", "demo-user");
  fd.append("projectId", "demo-project");
  const res = await fetch(`${API}/analysis-landing-page`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiScript(
  report: string,
  landingAnalysis: string,
  angle?: AngleFull | null,
  anglesText?: string,
): Promise<ScriptResp> {
  const fd = new FormData();
  fd.append("report", report);
  fd.append("landing_analysis", landingAnalysis);
  if (anglesText) fd.append("angles_text", anglesText);
  if (angle) {
    fd.append("angle_json", JSON.stringify(angle));
    if (angle.title) fd.append("angle_title", angle.title);
    if (angle.raw) fd.append("angle_raw", angle.raw);
  } else {
    fd.append("angle_title", "(custom)");
  }
  fd.append("userId", "demo-user");
  fd.append("projectId", "demo-project");
  const res = await fetch(`${API}/generate-script`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiHook(
  script: string,
  report: string,
  landingAnalysis: string,
  anglesText?: string,
): Promise<HookResp> {
  const fd = new FormData();
  fd.append("script", script);
  fd.append("report", report);
  fd.append("landing_analysis", landingAnalysis);
  if (anglesText) fd.append("angles_text", anglesText);
  fd.append("userId", "demo-user");
  fd.append("projectId", "demo-project");
  const res = await fetch(`${API}/generate-hook`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
