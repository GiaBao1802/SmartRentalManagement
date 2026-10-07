import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Góc trọ – Tìm dễ, ở yên",
    template: "%s | Góc trọ",
  },
  description: "Tìm phòng trọ phù hợp và quản lý nhà trọ trên Góc trọ.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={beVietnamPro.className}>{children}</body>
    </html>
  );
}
