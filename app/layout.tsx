import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppShellGate } from "@/components/rextora/shell/AppShellGate";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const SOCIAL_PREVIEW = "/brand/rextora-share-1200x630-v1.png";
const FULL_LOGO = "/brand/rextora-logo-main-transparent.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://rextora.com"),
  title: "Rextora — Quant Futures Platform",
  description: "Private Binance Futures quant automation dashboard",
  applicationName: "Rextora",
  appleWebApp: {
    capable: true,
    title: "Rextora",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Rextora — Quant Futures Platform",
    description: "Private Binance Futures quant automation dashboard",
    url: "https://rextora.com",
    siteName: "Rextora",
    type: "website",
    locale: "ko_KR",
    images: [
      {
        url: SOCIAL_PREVIEW,
        width: 1200,
        height: 630,
        alt: "Rextora — AI Trading Employee",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rextora — Quant Futures Platform",
    description: "Private Binance Futures quant automation dashboard",
    images: [SOCIAL_PREVIEW],
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
          #rextora-launch{position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:#0a0f16}
          #rextora-launch img{width:min(420px,72vw);height:auto;object-fit:contain}
          .rextora-launch-screen{min-height:100vh;display:grid;place-items:center;background:#0a0f16}
          .rextora-launch-screen img{width:min(420px,72vw);height:auto;object-fit:contain}
        `}</style>
      </head>
      <body>
        <Suspense
          fallback={
            <div id="rextora-launch" data-testid="rextora-launch-branding">
              <img src={FULL_LOGO} alt="Rextora" width={460} height={128} />
            </div>
          }
        >
          <AppShellGate>{children}</AppShellGate>
        </Suspense>
      </body>
    </html>
  );
}
