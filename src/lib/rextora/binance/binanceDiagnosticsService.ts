import { getConfig } from "../config";
import { getEnv, hasBinanceCredentials } from "../env";
import { getServerTpSlReadiness, initializeServerTpSlManagerReadiness } from "../serverTpSlReadiness";
import { getRextoraSettings } from "../settings/settingsService";
import { BinanceHttpError, signedGet } from "./binanceHttpClient";
import type { BinanceDiagnosticItem, BinanceDiagnosticsReport, BinanceDiagnosticStatus } from "../binanceDiagnosticsTypes";
export type { BinanceDiagnosticItem, BinanceDiagnosticsReport, BinanceDiagnosticStatus } from "../binanceDiagnosticsTypes";
export { diagnosticStatusLabel, diagnosticStatusTone } from "../binanceDiagnosticsTypes";
import {
  getExchangeInfo,
  getFuturesAccountBalanceReadOnly,
  getOpenOrders,
  getPositionRisk,
  getServerTime
} from "./binanceReadOnlyService";
import { closeUserDataListenKey, createUserDataListenKey } from "./binanceUserStreamService";
import type { BinanceFuturesAccountInfo } from "./binanceTypes";

function diag(
  id: string,
  label: string,
  status: BinanceDiagnosticStatus,
  reason: string,
  nextAction: string,
  errorCode?: number | string
): BinanceDiagnosticItem {
  return { id, label, status, reason, nextAction, ...(errorCode !== undefined ? { errorCode } : {}) };
}

export function mapBinanceDiagnosticError(error: unknown): {
  status: BinanceDiagnosticStatus;
  reason: string;
  errorCode?: number | string;
  nextAction: string;
} {
  if (error instanceof BinanceHttpError) {
    if (error.code === -2015) {
      return {
        status: "blocked",
        reason: "API 키 권한, IP 제한, 또는 Futures 권한을 확인하세요.",
        errorCode: error.code,
        nextAction: "Binance API 관리에서 Futures 읽기/거래 권한과 IP 화이트리스트를 확인하세요."
      };
    }
    if (error.code === -1021) {
      return {
        status: "blocked",
        reason: "PC 시간 또는 서버 시간 차이가 큽니다.",
        errorCode: error.code,
        nextAction: "PC 시간을 자동 동기화로 맞춘 뒤 서버를 재시작하세요."
      };
    }
    if (error.code === -1022) {
      return {
        status: "blocked",
        reason: "API Secret 서명 오류입니다.",
        errorCode: error.code,
        nextAction: ".env.local의 BINANCE_API_SECRET 값을 확인하고 서버를 재시작하세요."
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        status: "blocked",
        reason: "API 권한 또는 IP 제한 문제입니다.",
        errorCode: error.status,
        nextAction: "API 키 권한과 IP 화이트리스트 설정을 확인하세요."
      };
    }
    return {
      status: "blocked",
      reason: error.message || "Binance API 요청이 실패했습니다.",
      errorCode: error.code ?? error.status,
      nextAction: "Binance API 상태와 .env.local 설정을 확인한 뒤 다시 점검하세요."
    };
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || /timeout|aborted/i.test(error.message)) {
      return {
        status: "warning",
        reason: "Binance 연결 지연 또는 네트워크 문제입니다.",
        nextAction: "인터넷 연결과 방화벽을 확인한 뒤 잠시 후 다시 점검하세요."
      };
    }
    if (/credentials are not configured/i.test(error.message)) {
      return {
        status: "unknown",
        reason: "Binance API Key 또는 Secret이 설정되지 않았습니다.",
        nextAction: ".env.local에 Binance API Key / Secret을 입력하세요."
      };
    }
    return {
      status: "blocked",
      reason: error.message,
      nextAction: "오류 메시지를 확인하고 .env.local과 API 권한을 점검하세요."
    };
  }

  return {
    status: "unknown",
    reason: "알 수 없는 오류가 발생했습니다.",
    nextAction: "Binance 연결을 다시 점검하세요."
  };
}

async function probeSignedAccount(): Promise<{ ok: boolean; data?: BinanceFuturesAccountInfo; error?: unknown }> {
  if (!hasBinanceCredentials()) return { ok: false };
  try {
    const data = await signedGet<BinanceFuturesAccountInfo>("/fapi/v2/account");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}

async function probeUserStreamListenKey(): Promise<{ ok: boolean; error?: unknown }> {
  if (!hasBinanceCredentials()) return { ok: false };
  try {
    const created = await createUserDataListenKey();
    await closeUserDataListenKey(created.listenKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function missingCredentialsItems(): BinanceDiagnosticItem[] {
  const action = ".env.local에 Binance API Key / Secret을 입력하고 서버를 재시작하세요.";
  return [
    diag("connection", "Binance 연결", "unknown", "API 키가 없어 연결을 확인할 수 없습니다.", action),
    diag("account", "계정 조회", "unknown", "API 키가 없어 계정 조회를 할 수 없습니다.", action),
    diag("balance", "잔고 조회", "unknown", "API 키가 없어 잔고 조회를 할 수 없습니다.", action),
    diag("position", "포지션 조회", "unknown", "API 키가 없어 포지션 조회를 할 수 없습니다.", action),
    diag("open_orders", "열린 주문 조회", "unknown", "API 키가 없어 주문 조회를 할 수 없습니다.", action),
    diag("user_stream", "User Data Stream", "unknown", "API 키가 없어 User Stream을 확인할 수 없습니다.", action),
    diag(
      "order_permission",
      "주문 권한",
      "blocked",
      "실전 주문은 LIVE 안전 조건 통과 전까지 차단됩니다.",
      "PAPER 모드로 운영하고 LIVE 체크리스트를 완료하세요."
    ),
    diag("futures_permission", "Futures 권한", "unknown", "API 키가 없어 Futures 권한을 확인할 수 없습니다.", action)
  ];
}

/** Read-only Binance diagnostics — never places real orders. */
export async function runBinanceDiagnostics(): Promise<BinanceDiagnosticsReport> {
  const config = getConfig();
  const env = getEnv();
  const configured = hasBinanceCredentials();
  const network = env.BINANCE_TESTNET ? "testnet" : "mainnet";

  if (!configured) {
    return {
      checkedAt: new Date().toISOString(),
      network,
      baseUrl: config.binance.futuresBaseUrl,
      items: [
        ...missingCredentialsItems(),
        getServerTpSlReadiness().managerReady
          ? diag("server_tpsl", "서버 TP/SL", "normal", "서버 TP/SL 매니저가 준비되었습니다.", "LIVE 체크리스트의 TP/SL 항목을 함께 확인하세요.")
          : diag("server_tpsl", "서버 TP/SL", "blocked", getServerTpSlReadiness().reason, "설정에서 서버 TP/SL을 활성화하고 LIVE 체크리스트를 확인하세요.")
      ]
    };
  }

  const [serverTime, exchangeInfo, accountProbe, balance, positions, openOrders, streamProbe] = await Promise.all([
    getServerTime(),
    getExchangeInfo(),
    probeSignedAccount(),
    getFuturesAccountBalanceReadOnly(),
    getPositionRisk(),
    getOpenOrders(),
    probeUserStreamListenKey()
  ]);

  const items: BinanceDiagnosticItem[] = [];
  let accountCanTrade: boolean | undefined;
  let signedReadFailed = false;
  let signedError: unknown;

  if (serverTime.ok && serverTime.data?.serverTime) {
    const driftMs = Math.abs(Date.now() - serverTime.data.serverTime);
    if (driftMs > 5000) {
      items.push(
        diag(
          "server_time_hint",
          "서버 시간",
          "warning",
          `로컬 시간과 Binance 서버 시간 차이가 ${Math.round(driftMs / 1000)}초입니다.`,
          "PC 시간을 자동 동기화로 맞춘 뒤 서버를 재시작하세요.",
          -1021
        )
      );
    }
  }

  if (accountProbe.ok && accountProbe.data) {
    accountCanTrade = accountProbe.data.canTrade;
    items.push(
      diag("connection", "Binance 연결", "normal", "서명된 계정 API 요청에 성공했습니다.", "읽기 연결이 정상입니다."),
      diag(
        "account",
        "계정 조회",
        "normal",
        "Futures 계정 정보 조회에 성공했습니다.",
        accountCanTrade ? "계정에서 거래 가능(canTrade)으로 표시됩니다." : "계정에서 거래가 비활성(canTrade=false)입니다. API 키 거래 권한을 확인하세요."
      )
    );
  } else {
    signedReadFailed = true;
    signedError = accountProbe.error ?? new BinanceHttpError("Futures account read failed");
    const mapped = mapBinanceDiagnosticError(signedError);
    items.push(
      diag("connection", "Binance 연결", mapped.status, mapped.reason, mapped.nextAction, mapped.errorCode),
      diag("account", "계정 조회", "blocked", mapped.reason, mapped.nextAction, mapped.errorCode)
    );
  }

  if (balance.ok) {
    items.push(diag("balance", "잔고 조회", "normal", "Futures 잔고 조회에 성공했습니다.", "잔고 동기화가 가능합니다."));
  } else {
    signedReadFailed = true;
    const mapped = mapBinanceDiagnosticError(new BinanceHttpError(balance.message));
    items.push(diag("balance", "잔고 조회", "blocked", balance.message || mapped.reason, mapped.nextAction, mapped.errorCode));
  }

  if (positions.ok) {
    items.push(diag("position", "포지션 조회", "normal", "포지션(positionRisk) 조회에 성공했습니다.", "포지션 동기화가 가능합니다."));
  } else {
    const mapped = mapBinanceDiagnosticError(new BinanceHttpError(positions.message));
    items.push(diag("position", "포지션 조회", "blocked", positions.message || mapped.reason, mapped.nextAction, mapped.errorCode));
  }

  if (openOrders.ok) {
    items.push(
      diag(
        "open_orders",
        "열린 주문 조회",
        "normal",
        `열린 주문 조회에 성공했습니다. (현재 ${openOrders.data?.length ?? 0}건)`,
        "주문 조회 읽기 권한이 정상입니다."
      )
    );
  } else {
    const mapped = mapBinanceDiagnosticError(new BinanceHttpError(openOrders.message));
    items.push(diag("open_orders", "열린 주문 조회", "blocked", openOrders.message || mapped.reason, mapped.nextAction, mapped.errorCode));
  }

  if (streamProbe.ok) {
    items.push(
      diag(
        "user_stream",
        "User Data Stream",
        "normal",
        "listenKey 발급·해제 테스트에 성공했습니다.",
        "실시간 계정 동기화 준비가 되었습니다. WebSocket 연결은 별도로 확인하세요."
      )
    );
  } else {
    const mapped = mapBinanceDiagnosticError(streamProbe.error ?? new Error("listenKey failed"));
    items.push(diag("user_stream", "User Data Stream", mapped.status, mapped.reason, mapped.nextAction, mapped.errorCode));
  }

  if (accountProbe.ok && accountCanTrade === true && openOrders.ok) {
    items.push(
      diag(
        "order_permission",
        "주문 권한",
        "warning",
        "계정에서 거래 가능(canTrade)이며 주문 조회는 성공했습니다. 실제 주문은 LIVE 안전 조건 통과 전까지 차단됩니다.",
        "PAPER 모드로 테스트하고 LIVE 체크리스트를 모두 통과한 뒤에만 실전 주문을 고려하세요."
      )
    );
  } else if (accountProbe.ok && accountCanTrade === false) {
    items.push(
      diag(
        "order_permission",
        "주문 권한",
        "blocked",
        "Binance 계정에서 canTrade=false 로 표시됩니다.",
        "Binance API 키에 Futures 거래 권한이 있는지, IP 제한이 없는지 확인하세요."
      )
    );
  } else {
    const mapped = mapBinanceDiagnosticError(signedError ?? new Error("주문 권한 확인 불가"));
    items.push(
      diag(
        "order_permission",
        "주문 권한",
        "blocked",
        "주문 권한을 확인할 수 없습니다. 계정 조회 또는 주문 조회가 실패했습니다.",
        mapped.nextAction,
        mapped.errorCode
      )
    );
  }

  const futuresReadOk = accountProbe.ok && balance.ok && positions.ok;
  if (futuresReadOk) {
    items.push(
      diag("futures_permission", "Futures 권한", "normal", "Futures 계정·잔고·포지션 읽기 권한이 확인되었습니다.", "Futures API 권한이 정상입니다.")
    );
  } else {
    const mapped = mapBinanceDiagnosticError(signedError ?? new BinanceHttpError("Futures read failed", undefined, -2015));
    items.push(
      diag(
        "futures_permission",
        "Futures 권한",
        "blocked",
        signedReadFailed ? mapped.reason : "Futures 포지션 조회에 문제가 있습니다.",
        mapped.nextAction,
        mapped.errorCode
      )
    );
  }

  if (futuresReadOk && getRextoraSettings().tpSl.serverTpSlRequired) {
    await initializeServerTpSlManagerReadiness({ exchangeInfoValidated: exchangeInfo.ok }).catch(() => undefined);
  }

  const tpSlReady = getServerTpSlReadiness().managerReady;
  items.push(
    tpSlReady
      ? diag("server_tpsl", "서버 TP/SL", "normal", "서버 TP/SL 매니저가 준비되었습니다.", "LIVE 체크리스트의 TP/SL 항목을 함께 확인하세요.")
      : diag("server_tpsl", "서버 TP/SL", "blocked", getServerTpSlReadiness().reason, "서버 TP/SL 매니저 초기화를 실행하고 다시 점검하세요.")
  );

  if (signedReadFailed && serverTime.ok && exchangeInfo.ok) {
    const connection = items.find((i) => i.id === "connection");
    if (connection) {
      connection.reason = `${connection.reason} 공개 API는 정상이나 서명 요청이 실패했습니다.`;
      connection.nextAction = "테스트넷 설정(BINANCE_TESTNET)과 API 키 종류(테스트넷/메인넷)가 일치하는지 확인하세요.";
      if (connection.status === "blocked") connection.status = "warning";
    }
  }

  const timeHint = items.find((i) => i.id === "server_time_hint");
  if (timeHint) {
    const connection = items.find((i) => i.id === "connection");
    if (connection && connection.status === "normal") {
      connection.status = "warning";
      connection.reason = `${connection.reason} ${timeHint.reason}`;
      connection.nextAction = timeHint.nextAction;
    }
  }

  const uiItems = items.filter((i) => !["server_time_hint"].includes(i.id));

  return {
    checkedAt: new Date().toISOString(),
    network,
    baseUrl: config.binance.futuresBaseUrl,
    items: uiItems
  };
}
