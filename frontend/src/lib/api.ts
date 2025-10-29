const API = process.env.NEXT_PUBLIC_API_BASE || "https//www.casesurf.space/api";

console.log("NEXT_PUBLIC_API_BASE =", process.env.NEXT_PUBLIC_API_BASE);


export async function uploadAndAnalyzeReport(video: File, message: string, userId="demo-user", projectId="demo-project") {
  const fd = new FormData();
  fd.append("video", video);
  fd.append("message", message);
  fd.append("userId", userId);
  fd.append("projectId", projectId);
  const r = await fetch(`${API}/analysis-report`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ step: "report_done"; report: string; options: { create_script: boolean; analyze_landing_page: boolean } }>;
}

export async function analyzeLandingPage(landingUrl: string, userId="demo-user", projectId="demo-project") {
  const fd = new FormData();
  fd.append("landingUrl", landingUrl);
  fd.append("userId", userId);
  fd.append("projectId", projectId);
  const r = await fetch(`${API}/analysis-landing-page`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ step: "landing_done"; landing_report: string; angles: string[] }>;
}

export async function generateScript(report: string, angle: string, userId="demo-user", projectId="demo-project") {
  const fd = new FormData();
  fd.append("report", report);
  fd.append("angle", angle);
  fd.append("userId", userId);
  fd.append("projectId", projectId);
  const r = await fetch(`${API}/generate-script`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ step: "script_done"; angle: string; script: string }>;
}
