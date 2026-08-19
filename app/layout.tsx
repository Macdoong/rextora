import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/rextora/Sidebar";
import { AppShell } from "@/components/rextora/agent/AppShell";

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
      <head>
        <style>{`
          .dashboard-shell{display:grid;grid-template-columns:15.75rem 1fr;min-height:100vh}
          .rextora-mobile-header{display:none}
          @media(max-width:1100px){
            .dashboard-shell{display:block}
            .rextora-desktop-sidebar{display:none!important}
            .rextora-mobile-header{display:block;height:61px;min-height:61px}
          }
        `}</style>
      </head>
      <body>
        <div className="dashboard-shell">
          <Sidebar />
          <main className="dashboard-main">
            <AppShell>{children}</AppShell>
          </main>
        </div>
      </body>
    </html>
  );
}
