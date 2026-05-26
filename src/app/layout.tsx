import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "个人空间",
  description: "Yimei-style AI course platform",
  icons: {
    icon: "/logo.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
