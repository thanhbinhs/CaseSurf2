export function fmtBytes(n: number) {
  if (!n && n !== 0) return "";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

export async function extractVideoThumbnail(file: File): Promise<string | null> {
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.preload = "metadata";
    video.muted = true;
    (video as any).playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Load video failed"));
    });

    const target = Math.min(0.1, (video.duration || 1) / 4);
    await new Promise<void>((resolve) => {
      const handler = () => { video.removeEventListener("seeked", handler); resolve(); };
      video.addEventListener("seeked", handler);
      try { video.currentTime = target; } catch { resolve(); }
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.85);
    URL.revokeObjectURL(url);
    return data;
  } catch {
    return null;
  }
}

export function angleFromFreeText(text: string) {
  const first = text.split("\n")[0]?.trim() || text.slice(0, 80);
  const title = first.slice(0, 80) || "(custom angle)";
  return { title, raw: text };
}
