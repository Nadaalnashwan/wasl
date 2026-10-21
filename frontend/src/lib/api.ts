/* Thin typed client for the Wasl FastAPI backend. Only the user's session token is sent — never provider keys. */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  detail: unknown;
  code?: string;
  constructor(status: number, message: string, detail?: unknown, code?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;
let onUnauthorized: () => void = () => {};

export function configureApi(tokenGetter: TokenGetter, unauthorized: () => void) {
  getToken = tokenGetter;
  onUnauthorized = unauthorized;
}

function messageFrom(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (typeof d.message === "string") return d.message;
    if (typeof d.detail === "string") return d.detail;
  }
  if (status === 0) return "Cannot reach the Wasl server. Is the backend running?";
  return `Request failed (${status})`;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = await getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, messageFrom(null, 0));
  }
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const detail = data?.detail ?? data;
    let msg = messageFrom(detail, res.status);
    if (Array.isArray(data?.errors) && data.errors.length) {
      msg += ": " + data.errors.map((e: { field: string; message: string }) => `${e.field || "input"} — ${e.message}`).join("; ");
    }
    throw new ApiError(res.status, msg, detail, data?.code);
  }
  return data as T;
}

export async function download(path: string, fallbackName: string) {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "Download failed");
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const name = star ? decodeURIComponent(star[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function upload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  return api<T>(path, { method: "POST", body: fd });
}

export async function getApiToken(): Promise<string | null> {
  return getToken();
}