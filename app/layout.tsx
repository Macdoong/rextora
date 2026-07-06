import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/rextora/Sidebar";

export const metadata: Metadata = {
  title: "Rextora AI Scalping Bot",
  description: "Private Binance Futures AI scalping automation dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="dashboard-shell">
          <Sidebar />
          <main className="dashboard-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
