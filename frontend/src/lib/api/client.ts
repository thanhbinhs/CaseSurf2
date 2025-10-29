const API_BASE =
  (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");

export function apiUrl(path: string) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function buildError(res: Response) {
  let body = "";
  try { body = await res.text(); } catch {}
  let msg = `HTTP ${res.status}`;
  if (body) {
    try {
      const j = JSON.parse(body);
      msg = (j as any)?.detail || (j as any)?.message || body;
    } catch {
      msg = body;
    }
  }
  const err = new Error(msg);
  (err as any).status = res.status;
  return err;
}

export async function postFormAbsolute(url: string, form: FormData) {
  const res = await fetch(url, { method: "POST", body: form, credentials: "include" });
  if (!res.ok) throw await buildError(res);
  return res.json();
}

export async function postJSONAbsolute<T = any>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) throw await buildError(res);
  return res.json();
}

