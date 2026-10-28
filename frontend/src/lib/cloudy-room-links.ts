export type CloudyMessageSegment = { text: string; roomId?: string; href?: string };

function resultsHref(encodedQuery: string): string | null {
  try {
    const params = new URLSearchParams(decodeURIComponent(encodedQuery));
    const allowed = new Set(["location", "price_min", "price_max", "area_min", "area_max", "capacity_min", "page", "page_size", "sort"]);
    const keys = [...params.keys()];
    if (!keys.length || keys.some(key => !allowed.has(key)) || keys.some((key, index) => keys.indexOf(key) !== index)) return null;
    if (params.get("page") !== "1" || params.get("page_size") !== "12" || params.get("sort") !== "price_asc") return null;
    if (params.has("location") && params.get("location")!.length > 100) return null;
    return `/rooms?${params.toString()}`;
  } catch { return null; }
}

export function parseCloudyRoomLinks(text: string, allowRoomLinks: boolean): CloudyMessageSegment[] {
  if (!allowRoomLinks) return [{ text }];
  return text.split(/(\[\[room:\d+\]\]|\[\[results:[A-Za-z0-9%._~+\-=]+\]\])/g).filter(Boolean).map(part => {
    const roomMatch = /^\[\[room:(\d+)\]\]$/.exec(part);
    if (roomMatch) return { text: "Xem chi tiết phòng", roomId: roomMatch[1] };
    const resultMatch = /^\[\[results:([A-Za-z0-9%._~+\-=]+)\]\]$/.exec(part);
    const href = resultMatch ? resultsHref(resultMatch[1]) : null;
    return href ? { text: "Xem toàn bộ kết quả phòng", href } : { text: part };
  });
}
