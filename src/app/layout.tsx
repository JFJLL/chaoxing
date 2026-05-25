import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "个人空间",
  description: "Chaoxing-style AI course platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
