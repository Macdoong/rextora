"use client";

import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/primitives";

const navItems: Array<[string, string]> = [
  ["대시보드", "/dashboard"],
  ["멀티코인 감시", "/market-watch"],
  ["AI 후보 랭킹", "/ai-candidates"],
  ["비용 분석", "/cost-analysis"],
  ["자동매매", "/trading"],
  ["리스크 관리", "/risk"],
  ["알림 / 텔레그램", "/alerts"],
  ["학습 기록", "/learning-log"],
  ["시스템 상태", "/system-status"],
  ["설정", "/settings"]
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen border-r border-slate-800/80 bg-slate-950/80 p-4 lg:block">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-xl font-black shadow-glow">R</div>
        <div>
          <div className="text-xl font-black tracking-tight">Rextora</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">AI Scalping Bot</div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300">거래 모드</span>
          <Badge tone="success">PAPER</Badge>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">LIVE는 안전 체크리스트 통과 전 차단됩니다.</p>
      </div>

      <nav className="space-y-1" data-testid="main-nav">
        {navItems.map(([label, href]) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <a
              key={href}
              href={href}
              data-testid={`nav-${href.slice(1)}`}
              className={`block rounded-lg px-3 py-2 text-sm transition ${
                active ? "bg-violet-600 text-white shadow-glow" : "text-slate-300 hover:bg-violet-500/15 hover:text-white"
              }`}
            >
              {label}
            </a>
          );
        })}
      </nav>

      <div className="absolute bottom-4 left-4 right-4 text-[11px] text-slate-500">Rextora v2.0 · Futures Scalping</div>
    </aside>
  );
}
