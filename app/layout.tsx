import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppShellGate } from "@/components/rextora/shell/AppShellGate";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rextora — Quant Futures Platform",
  description: "Private Binance Futures quant automation dashboard",
  applicationName: "Rextora",
  appleWebApp: {
    capable: true,
    title: "Rextora",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0f16",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={sans.variable}>
      <head>
        <style>{`
          .dashboard-shell{display:grid;grid-template-columns:242px minmax(0,1fr);min-height:100vh}
          .rextora-mobile-header{display:none}
          @media(min-width:1180px) and (max-width:1399px){
            .dashboard-shell{grid-template-columns:92px minmax(0,1fr)}
          }
          @media(max-width:1179px){
            .dashboard-shell{display:block}
            .rextora-desktop-sidebar{display:none!important}
            .rextora-mobile-header{display:block}
          }
        `}</style>
      </head>
      <body>
        <AppShellGate>{children}</AppShellGate>
      </body>
    </html>
  );
}
