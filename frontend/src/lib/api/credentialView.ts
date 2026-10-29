import { isPublicExplorerPath } from "../public-navigation";

export function passwordErrors(password: string, confirmation: string) {
  return {
    password: password.length < 12 || password.length > 1024 ? "Mật khẩu cần từ 12 đến 1024 ký tự." : "",
    confirmation: password !== confirmation ? "Mật khẩu xác nhận chưa khớp." : "",
  };
}
export function loginTarget(role: "admin" | "resident" | "superadmin", requested: string | null, origin: string) {
  const fallback = role === "admin" ? "/admin/properties" : role === "resident" ? "/tenant" : "/platform/cloudy";
  if (!requested?.startsWith("/")) return fallback;
  try {
    const parsed = new URL(requested, origin);
    if (parsed.origin !== origin || requested.startsWith("//")) return fallback;
    if (role === "resident" && parsed.pathname !== "/tenant" && !isPublicExplorerPath(parsed.pathname)) return fallback;
    if (role === "superadmin" && parsed.pathname !== "/platform/cloudy") return fallback;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return fallback; }
}

export function credentialFailure(reason: unknown) {
  if (reason instanceof TypeError || !(reason instanceof Error)) return "Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.";
  return reason.message;
}
