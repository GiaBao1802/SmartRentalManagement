/** Frontend handoff only. Replace the source implementation after the API contract is approved. */
export type CloudySuggestionScope = "public" | "admin" | "resident";

export type CloudySuggestion = {
  id: string;
  text: string;
  expiresAt: string;
  scope: CloudySuggestionScope;
};

export type CloudySuggestionContext = {
  pathname: string;
  scope: CloudySuggestionScope;
  accountId: string | null;
};

export type CloudySuggestionSource = (
  context: CloudySuggestionContext,
) => CloudySuggestion | null | Promise<CloudySuggestion | null>;

// No production suggestion source or endpoint is connected yet.
export const cloudySuggestionSource: CloudySuggestionSource = (context) => {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return null;
  // Explorer replaces its URL while loading, so a development session flag also supports preview there.
  let sessionPreview: string | null = null;
  try { sessionPreview = window.sessionStorage.getItem("cloudy-2d-preview-scope"); } catch { /* Storage can be unavailable. */ }
  const preview = new URLSearchParams(window.location.search).get("cloudyPreview") ?? sessionPreview;
  if (preview !== context.scope || (preview !== "public" && preview !== "admin")) return null;
  return {
    id: `preview:${preview}`,
    text: preview === "public"
      ? "[Mô phỏng] Chọn một tỉnh trên bản đồ để khám phá phòng đang đăng."
      : "[Mô phỏng] Mở khu quản trị để xem công việc cần xử lý.",
    expiresAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    scope: preview,
  };
};

export function validateCloudySuggestion(value: CloudySuggestion | null, scope: CloudySuggestionScope): CloudySuggestion | null {
  if (!value || value.scope !== scope || !/^[A-Za-z0-9:._-]{1,80}$/.test(value.id)) return null;
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || typeof value.text !== "string") return null;
  const text = value.text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return { ...value, text: text.length > 160 ? `${text.slice(0, 159).trimEnd()}…` : text };
}
