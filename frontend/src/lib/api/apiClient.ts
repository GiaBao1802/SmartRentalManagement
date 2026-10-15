import { apiErrorFrom, type ApiErrorBody } from "./errors";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
let csrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function clearCsrfToken() {
  csrfToken = null;
}

async function refreshCsrfToken(): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/auth/csrf`, { credentials: "include", cache: "no-store" });
  const body = await response.json() as { data?: { csrf_token?: string }; error?: ApiErrorBody["error"] };
  if (!response.ok || !body.data?.csrf_token) throw apiErrorFrom(response.status, { error: body.error });
  csrfToken = body.data.csrf_token;
  return csrfToken;
}

export async function apiRequest<T>(path: string, options: RequestInit & { authRequired?: boolean } = {}): Promise<T> {
  const { authRequired = true, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) headers.set("X-CSRF-Token", await refreshCsrfToken());

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      method,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("Không thể kết nối máy chủ. Hãy kiểm tra backend và thử lại.");
  }

  let body: { data?: T; meta?: unknown; error?: ApiErrorBody["error"] } = {};
  if (response.status !== 204) {
    try { body = await response.json() as typeof body; }
    catch { body = {}; }
  }
  if (!response.ok) {
    if (response.status === 401 && authRequired) {
      unauthorizedHandler?.();
      if (!unauthorizedHandler && typeof window !== "undefined") window.dispatchEvent(new Event("goctro:unauthorized"));
    }
    throw apiErrorFrom(response.status, { error: body.error });
  }
  // Paginated V1 endpoints return `data` and `meta` as sibling fields. Preserve
  // additional read-model siblings (for example server-computed workspace summary).
  if (body.meta === undefined) return body.data as T;
  const siblings = Object.fromEntries(Object.entries(body).filter(([key]) => !["data", "meta", "error"].includes(key)));
  return { data: body.data, meta: body.meta, ...siblings } as T;
}
