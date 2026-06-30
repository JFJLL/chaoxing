import type { Metadata } from "next";
import "./globals.css";
import { InteractionFeedback } from "@/components/shell/InteractionFeedback";

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
      <body>
        <InteractionFeedback />
        {children}
      </body>
    </html>
  );
}
