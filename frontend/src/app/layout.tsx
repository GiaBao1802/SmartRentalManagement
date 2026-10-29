import type { Metadata } from "next";
import "./brand-fonts.css";
import "./globals.css";
import "./components/public-account-links.css";
import { AuthProvider } from "./components/auth-provider";
import { Cloudy2D } from "./components/cloudy-2d";

export const metadata: Metadata = {
  title: {
    default: "Góc Trọ – Một góc yên tâm.",
    template: "%s | Góc trọ",
  },
  description: "Tìm phòng trọ phù hợp và quản lý nhà trọ trên Góc Trọ.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body><AuthProvider>{children}<Cloudy2D /></AuthProvider></body>
    </html>
  );
}
