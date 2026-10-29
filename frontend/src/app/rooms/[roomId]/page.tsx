import type { Metadata } from "next";
import PublicRoomDetailPage from "./public-room-detail";
import { getPublicRoom } from "../../../lib/api/publicRoomApi";
import { publicSearchReturnHref } from "../../../lib/public-navigation";

type Props = { params: Promise<{ roomId: string }>; searchParams: Promise<{ returnTo?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roomId } = await params;
  try {
    const room = await getPublicRoom(roomId);
    return {
      title: `${room.property.name} · Phòng ${room.room_code}`,
      description: room.public_description || `Thông tin phòng ${room.room_code} tại ${room.property.name}, ${room.property.province}.`,
    };
  } catch {
    return { title: "Phòng trọ không còn khả dụng", description: "Xem các phòng trọ đang được đăng công khai trên Góc Trọ." };
  }
}

export default async function PublicRoomPage({ params, searchParams }: Props) {
  const { roomId } = await params;
  const { returnTo } = await searchParams;
  return <PublicRoomDetailPage roomId={roomId} returnTo={publicSearchReturnHref(typeof returnTo === "string" ? returnTo : null)} />;
}
