import { Badge, Card, Metric } from "@/components/ui/primitives";
import type { ApiStatus } from "@/lib/types";

export function ApiStatusPanel({ api }: { api: ApiStatus }) {
  return (
    <Card title="API 상태 상세" action={<Badge tone={api.binanceFuturesConnected ? "success" : "danger"}>{api.binanceFuturesConnected ? "연결 정상" : "연결 오류"}</Badge>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Binance Futures" value={api.binanceFuturesConnected ? "연결됨" : "미연결"} tone={api.binanceFuturesConnected ? "success" : "danger"} />
        <Metric label="Futures 권한" value={api.futuresPermission} />
        <Metric label="주문 권한" value={api.orderPermission} tone={api.orderPermission === "정상" ? "success" : "danger"} />
        <Metric label="읽기 권한" value={api.readPermission} />
        <Metric label="IP 제한" value={api.ipRestriction} />
        <Metric label="잔고 조회" value={api.lastBalanceFetchTime} />
        <Metric label="주문 조회" value={api.lastOrderFetchTime} />
        <Metric label="API 만료" value={api.apiKeyExpirationDate} />
        <Metric label="전략 파일" value={api.strategyFileLoaded ? "로드됨" : "실패"} tone={api.strategyFileLoaded ? "success" : "danger"} />
        <Metric label="실주문 엔진" value={api.realOrderEngineConnected ? "연결됨" : "미연결"} tone={api.realOrderEngineConnected ? "danger" : "success"} />
        <Metric label="더미 루프" value={api.dummyLoopDetected ? "감지됨" : "없음"} tone={api.dummyLoopDetected ? "danger" : "success"} />
        <Metric label="서버 TP/SL" value={api.serverTpSlActive ? "활성" : "비활성"} tone={api.serverTpSlActive ? "success" : "danger"} />
        <Metric label="키 설정" value={api.configured.binanceApiKey && api.configured.binanceApiSecret ? "configured" : "mock"} />
        <Metric label="실주문 차단" value="주문 권한 차단" tone="danger" />
        <Metric label="서버 TP/SL 실주문" value="서버 TP/SL 실주문 구현 전" tone="danger" />
        <Metric label="실주문 상태" value="LIVE 주문 실행 비활성" tone="danger" />
      </div>
    </Card>
  );
}

export function IntegrationReadinessPanel({
  telegramMessage,
  binanceMessage,
  balanceMessage,
  marketMessage
}: {
  telegramMessage: string;
  binanceMessage: string;
  balanceMessage: string;
  marketMessage: string;
}) {
  return (
    <Card title="연동 준비 상태" action={<Badge tone="danger">LIVE 차단</Badge>}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Metric label="Telegram" value={telegramMessage} />
        <Metric label="Binance API 키" value={binanceMessage} />
        <Metric label="잔고 조회" value={balanceMessage} />
        <Metric label="시장 데이터" value={marketMessage} />
        <Metric label="주문 권한" value="차단" tone="danger" />
        <Metric label="실주문 엔진" value="미연결" tone="danger" />
        <Metric label="LIVE 실행" value="차단" tone="danger" />
        <Metric label="서버 TP/SL" value="서버 TP/SL 실주문 구현 전" tone="danger" />
      </div>
    </Card>
  );
}

export function MarketChartPanel({
  candles,
  sourceLabel = "mock market data"
}: {
  candles: Array<{ label: string; open: number; high: number; low: number; close: number }>;
  sourceLabel?: string;
}) {
  const min = Math.min(...candles.map((candle) => candle.low));
  const max = Math.max(...candles.map((candle) => candle.high));
  const range = max - min;

  return (
    <Card title="시장 요약">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-3xl font-black text-red-400">{candles.at(-1)?.close.toLocaleString()}</div>
          <div className="text-xs text-red-300">-1.25%</div>
        </div>
        <Badge tone="purple">BTCUSDT · 1H · {sourceLabel}</Badge>
      </div>
      <div className="flex h-44 items-end gap-3">
        {candles.map((candle) => {
          const high = ((candle.high - min) / range) * 150;
          const low = ((candle.low - min) / range) * 150;
          const close = ((candle.close - min) / range) * 150;
          const up = candle.close >= candle.open;

          return (
            <div key={candle.label} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="relative h-36 w-full">
                <div className="absolute left-1/2 w-px -translate-x-1/2 bg-slate-500" style={{ bottom: `${low}px`, height: `${Math.max(8, high - low)}px` }} />
                <div className={`absolute left-1/2 h-8 w-4 -translate-x-1/2 rounded-sm ${up ? "bg-green-500" : "bg-red-500"}`} style={{ bottom: `${close}px` }} />
              </div>
              <span className="text-[10px] text-slate-500">{candle.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
