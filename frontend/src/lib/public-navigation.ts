export const PUBLIC_HOME = "/tim-phong";

export function isPublicExplorerPath(pathname: string) {
  return pathname === PUBLIC_HOME || pathname === "/rooms" || pathname === "/tim-phong/danh-sach";
}

export function publicSearchReturnHref(requested?: string | null) {
  if (!requested?.startsWith("/") || requested.startsWith("//")) return PUBLIC_HOME;
  try {
    const url = new URL(requested, "https://goctro.invalid");
    if (url.origin !== "https://goctro.invalid" || !isPublicExplorerPath(url.pathname)) return PUBLIC_HOME;
    return (url.pathname === "/tim-phong/danh-sach" ? url.pathname : PUBLIC_HOME) + url.search;
  } catch { return PUBLIC_HOME; }
}

/** Retain public search filters without allowing an external return address. */
export function publicHomeHref(requested?: string | null) {
  if (!requested?.startsWith("/") || requested.startsWith("//")) return PUBLIC_HOME;
  try {
    const url = new URL(requested, "https://goctro.invalid");
    if (url.origin !== "https://goctro.invalid" || !isPublicExplorerPath(url.pathname)) return PUBLIC_HOME;
    return PUBLIC_HOME + url.search;
  } catch { return PUBLIC_HOME; }
}
