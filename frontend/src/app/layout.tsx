import type { Metadata } from "next";
import "./brand-fonts.css";
import "./globals.css";
import { AuthProvider } from "./components/auth-provider";

export const metadata: Metadata = {
  title: {
    default: "Góc Trọ – Một góc yên tâm.",
    template: "%s | Góc trọ",
  },
  description: "Tìm phòng trọ phù hợp và quản lý nhà trọ trên Góc trọ.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
