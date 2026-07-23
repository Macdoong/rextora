import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/rextora/Sidebar";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rextora — Quant Futures Platform",
  description: "Private Binance Futures quant automation dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={sans.variable}>
      <body>
        <div className="dashboard-shell">
          <Sidebar />
          <main className="dashboard-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
