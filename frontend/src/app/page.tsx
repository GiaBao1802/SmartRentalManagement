import type { Metadata } from "next";
import PublicEntryRedirect from "./public-entry-redirect";

export const metadata: Metadata = {
  title: "Góc Trọ · Tìm phòng trên bản đồ Việt Nam",
  description: "Khám phá phòng đang cho thuê trên bản đồ 34 tỉnh thành. Lọc giá, diện tích và xem thông tin phòng công khai trên Góc Trọ.",
};

export default function HomePage() {
  return <PublicEntryRedirect />;
}
