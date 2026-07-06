import { apiStatusSeed } from "./seedData";
import { getServerTpSlState, getTpSlBlockReasons, validateServerTpSlRequired } from "./serverTpSlManager";
import type { TradingMode } from "./types";
import type { TpSlManagerStatus } from "./tpSlTypes";

export const tpSlImplementationReadiness = {
  designOnly: false,
  liveImplementationReady: true,
  message: "서버 TP/SL 실주문 구현 완료"
};

let paperServerTpSlActive = false;

export function getTpSlStatus(mode: TradingMode = "PAPER") {
  const liveState = getServerTpSlState();
  const active = mode === "PAPER" ? paperServerTpSlActive : liveState.active;
  const label = mode === "LIVE" && active ? "실거래 활성" : mode === "PAPER" && active ? "모의 활성" : "비활성";

  return {
    active,
    label,
    mode,
    serviceState: mode === "LIVE" ? (active ? ("live-ready" as const) : ("live-blocked" as const)) : ("simulated" as const)
  };
}

export function requireServerTpSlForLive(): boolean {
  return true;
}

export function validateServerTpSl(mode: TradingMode = "LIVE") {
  const status = getTpSlStatus(mode);
  const required = validateServerTpSlRequired(mode);
  return {
    ok: mode !== "LIVE" || (status.active && tpSlImplementationReadiness.liveImplementationReady && required.ok),
    ...status,
    message: mode === "LIVE" && !tpSlImplementationReadiness.liveImplementationReady
      ? tpSlImplementationReadiness.message
      : status.active ? "서버 TP/SL 상태가 확인되었습니다." : "LIVE 시작 전 서버 TP/SL이 필수입니다."
  };
}

export function simulateServerTpSlRegistration() {
  paperServerTpSlActive = true;
  return getTpSlStatus("PAPER");
}

export function getTpSlImplementationBlockReasons(): string[] {
  return getTpSlBlockReasons();
}

export function validatePreLiveTpSlReadiness(mode: TradingMode = "LIVE") {
  const blockReasons = mode === "LIVE" ? getTpSlImplementationBlockReasons() : [];

  return {
    ok: mode !== "LIVE" || blockReasons.length === 0,
    mode,
    designOnly: tpSlImplementationReadiness.designOnly,
    liveImplementationReady: tpSlImplementationReadiness.liveImplementationReady,
    serviceState: mode === "LIVE" ? ("live-ready" as const) : ("simulated" as const),
    message: blockReasons[0] ?? "PAPER TP/SL simulation ready",
    blockReasons
  };
}

export function getTpSlManagerStatus(): TpSlManagerStatus {
  const state = getServerTpSlState();
  return {
    active: state.active,
    ready: tpSlImplementationReadiness.liveImplementationReady,
    openTpSlCount: state.active ? 2 : 0,
    failedTpSlCount: state.failedCount,
    lastPlacement: state.lastMessage
      ? {
          ok: Boolean(state.verified),
          symbol: state.symbol ?? "",
          tpOrderId: state.tpOrderId,
          slOrderId: state.slOrderId,
          verified: Boolean(state.verified),
          message: state.lastMessage,
          failedCount: state.failedCount
        }
      : undefined,
    message: state.lastMessage ?? tpSlImplementationReadiness.message
  };
}

export { apiStatusSeed };
