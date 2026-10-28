export type CloudyMessageSegment = { text: string; roomId?: string };

export function parseCloudyRoomLinks(text: string, allowRoomLinks: boolean): CloudyMessageSegment[] {
  if (!allowRoomLinks) return [{ text }];
  return text.split(/(\[\[room:\d+\]\])/g).filter(Boolean).map(part => {
    const match = /^\[\[room:(\d+)\]\]$/.exec(part);
    return match ? { text: "Xem chi tiết phòng", roomId: match[1] } : { text: part };
  });
}
