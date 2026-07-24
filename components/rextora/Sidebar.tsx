"use client";

import { usePathname } from "next/navigation";
import { ModeBadge } from "@/components/rextora/ModeBadge";

/** Primary lifecycle navigation — seven items only. */
const navItems: Array<[string, string]> = [
  ["대시보드", "/dashboard"],
  ["전략 탐색", "/strategy-search"],
  ["탐색 결과", "/results"],
  ["백테스트", "/backtest"],
  ["모의 매매", "/paper-trading"],
  ["실전 매매", "/live-trading"],
  ["시스템 설정", "/settings"],
];

function navActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  if (href === "/settings") {
    return (
      pathname === "/settings" ||
      pathname.startsWith("/system-status") ||
      pathname.startsWith("/risk") ||
      pathname.startsWith("/strategies")
    );
  }
  if (href === "/results") {
    return (
      pathname === "/results" ||
      pathname.startsWith("/strategy-performance") ||
      pathname.startsWith("/ai-reports")
    );
  }
  if (href === "/paper-trading") {
    return pathname.startsWith("/paper-trading") || pathname.startsWith("/trades");
  }
  if (href === "/strategy-search") {
    return (
      pathname.startsWith("/strategy-search") ||
      pathname.startsWith("/market-watch")
    );
  }
  return pathname === href || pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="sticky top-0 hidden h-screen border-r border-slate-800/80 bg-slate-950/80 p-4 lg:block">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-xl font-black shadow-glow">
            R
          </div>
          <div>
            <div className="text-xl font-black tracking-tight">Rextora</div>
            <div className="text-[11px] tracking-wide rx-text-muted">
              AI 전략 연구 · 거래 수명주기
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300">현재 거래 모드</span>
            <ModeBadge />
          </div>
          <p className="mt-2 text-[11px] rx-text-muted">
            실전 매매는 게이트·승인·위험 제한을 모두 통과한 뒤에만 실행됩니다.
          </p>
        </div>

        <nav className="space-y-1 overflow-y-auto pb-16" data-testid="main-nav">
          {navItems.map(([label, href]) => {
            const active = navActive(pathname, href);
            return (
              <a
                key={href}
                href={href}
                data-testid={`nav-${href.slice(1).replace(/\//g, "-")}`}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-violet-600 text-white shadow-glow"
                    : "text-slate-300 hover:bg-violet-500/15 hover:text-white"
                }`}
              >
                {label}
              </a>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-4 right-4 text-[11px] rx-text-muted">
          Rextora Quant · SAFE_v44 보호
        </div>
      </aside>
      <div className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <a href="/dashboard" className="font-black text-white">
            Rextora
          </a>
          <ModeBadge />
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">
              메뉴
            </summary>
            <nav
              className="absolute right-0 mt-2 grid w-52 gap-1 rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-2xl"
              data-testid="mobile-nav"
            >
              {navItems.map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    navActive(pathname, href)
                      ? "bg-violet-600 text-white"
                      : "text-slate-300"
                  }`}
                >
                  {label}
                </a>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </>
  );
}
