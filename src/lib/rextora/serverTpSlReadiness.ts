import { getExchangeInfo } from "./binance/binanceReadOnlyService";
import { calculateTpSlPrices } from "./tpSlPlacement";
import { getRextoraSettings } from "./settings/settingsService";
import { tpSlImplementationReadiness } from "./tpSlManager";

export interface ServerTpSlReadiness {
  implementationReady: boolean;
  settingEnabled: boolean;
  managerReady: boolean;
  reason: string;
  initializedAt: string | null;
}

type ManagerInitState = {
  ready: boolean;
  reason: string;
  initializedAt: string | null;
};

let managerInitState: ManagerInitState = {
  ready: false,
  reason: "서버 TP/SL 매니저 초기화가 아직 실행되지 않았습니다.",
  initializedAt: null
};

function isPlacementCallable(): boolean {
  return tpSlImplementationReadiness.liveImplementationReady && typeof calculateTpSlPrices === "function";
}

function validateTpSlSettings(): { ok: boolean; reason: string } {
  const settings = getRextoraSettings();
  if (settings.tpSl.takeProfitPct <= 0 || settings.tpSl.stopLossPct <= 0) {
    return { ok: false, reason: "TP/SL 비율 설정이 올바르지 않습니다." };
  }
  if (settings.tpSl.useAtrBasedTpSl && (settings.tpSl.atrTpMultiplier <= 0 || settings.tpSl.atrSlMultiplier <= 0)) {
    return { ok: false, reason: "ATR TP/SL 배수 설정이 올바르지 않습니다." };
  }
  return { ok: true, reason: "TP/SL 설정이 유효합니다." };
}

export function getServerTpSlReadiness(): ServerTpSlReadiness {
  const settings = getRextoraSettings();
  const implementationReady = isPlacementCallable();
  const settingEnabled = settings.tpSl.serverTpSlRequired;
  const managerReady = implementationReady && settingEnabled && managerInitState.ready;

  let reason = managerInitState.reason;
  if (!implementationReady) {
    reason = "서버 TP/SL 배치 코드가 준비되지 않았습니다.";
  } else if (!settingEnabled) {
    reason = "설정에서 서버 TP/SL 보호가 비활성화되어 있습니다.";
  } else if (managerReady) {
    reason = "서버 TP/SL 매니저가 준비되었습니다.";
  }

  return {
    implementationReady,
    settingEnabled,
    managerReady,
    reason,
    initializedAt: managerInitState.initializedAt
  };
}

export function resetServerTpSlManagerReadiness(): void {
  managerInitState = {
    ready: false,
    reason: "서버 TP/SL 매니저 초기화가 아직 실행되지 않았습니다.",
    initializedAt: null
  };
}

/** Safe readiness init — validates config and read-only exchange data only; never places orders. */
export async function initializeServerTpSlManagerReadiness(options?: {
  exchangeInfoValidated?: boolean;
}): Promise<ServerTpSlReadiness> {
  const implementationReady = isPlacementCallable();
  const settings = getRextoraSettings();
  const settingEnabled = settings.tpSl.serverTpSlRequired;

  if (!implementationReady) {
    managerInitState = {
      ready: false,
      reason: "서버 TP/SL 배치 코드가 준비되지 않았습니다.",
      initializedAt: null
    };
    return getServerTpSlReadiness();
  }

  if (!settingEnabled) {
    managerInitState = {
      ready: false,
      reason: "설정에서 서버 TP/SL 보호가 비활성화되어 있습니다.",
      initializedAt: null
    };
    return getServerTpSlReadiness();
  }

  const settingsCheck = validateTpSlSettings();
  if (!settingsCheck.ok) {
    managerInitState = {
      ready: false,
      reason: settingsCheck.reason,
      initializedAt: null
    };
    return getServerTpSlReadiness();
  }

  // Smoke-test price calculation without placing orders.
  try {
    calculateTpSlPrices(100, "LONG", 1);
  } catch {
    managerInitState = {
      ready: false,
      reason: "TP/SL 가격 계산기가 준비되지 않았습니다.",
      initializedAt: null
    };
    return getServerTpSlReadiness();
  }

  if (!options?.exchangeInfoValidated) {
    const exchange = await getExchangeInfo();
    if (!exchange.ok || !exchange.data) {
      managerInitState = {
        ready: false,
        reason: "거래소 exchangeInfo를 읽을 수 없어 TP/SL 매니저를 준비할 수 없습니다.",
        initializedAt: null
      };
      return getServerTpSlReadiness();
    }
  }

  managerInitState = {
    ready: true,
    reason: "서버 TP/SL 매니저가 준비되었습니다.",
    initializedAt: new Date().toISOString()
  };

  return getServerTpSlReadiness();
}

export function isServerTpSlManagerReady(): boolean {
  return getServerTpSlReadiness().managerReady;
}
