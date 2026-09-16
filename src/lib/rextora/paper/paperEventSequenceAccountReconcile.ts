/**
 * In-memory Pattern Paper account reconstruction from durable session + positions.
 * Does not write session, position, or strategy files.
 */

import {
  getAccountState,
  replacePaperAccountBalances,
} from "../accountStateStore";
import { getOpenPositions } from "../positionManager";
import { getStrategyById } from "../strategy/strategyStore";
import { getExecutablePaperSession, type PaperSession } from "./paperSessionStore";
import type { Position } from "../types";

export const PAPER_ES_AVAILABLE_BALANCE_FORMULA =
  "availableBalanceUsdt = virtualBalance + realizedPnl";

export const PAPER_ES_AVAILABLE_BALANCE_REASON =
  "applyPaperRealizedPnl adds the same delta to balanceUsdt and availableBalanceUsdt; no Paper reserve/release of open margin exists";

export function computeEventSequencePaperRealizedBalance(
  session: Pick<PaperSession, "virtualBalance" | "realizedPnl">,
): number {
  return Number((session.virtualBalance + session.realizedPnl).toFixed(8));
}

/**
 * Source-proven free capital for Pattern Paper.
 * Open Event-Sequence margin is stored on the position for sizing/settlement
 * but is never reserved against availableBalanceUsdt.
 * Live / non-ES positions are ignored.
 */
export function computeEventSequencePaperAvailableBalance(input: {
  realizedBalance: number;
  openPositions?: Position[];
}): number {
  void input.openPositions;
  return Number(input.realizedBalance.toFixed(8));
}

export function reconcileEventSequencePaperAccountState(): {
  applied: boolean;
  reason: string;
  balanceUsdt: number | null;
  availableBalanceUsdt: number | null;
  reservedMarginUsdt: number;
} {
  const current = getAccountState();
  if (current.mode === "LIVE") {
    return {
      applied: false,
      reason: "live_mode",
      balanceUsdt: null,
      availableBalanceUsdt: null,
      reservedMarginUsdt: 0,
    };
  }
  const session = getExecutablePaperSession();
  if (!session) {
    return {
      applied: false,
      reason: "no_executable_session",
      balanceUsdt: null,
      availableBalanceUsdt: null,
      reservedMarginUsdt: 0,
    };
  }
  let strategy;
  try {
    strategy = getStrategyById(session.strategyId);
  } catch {
    return {
      applied: false,
      reason: "strategy_unresolved",
      balanceUsdt: null,
      availableBalanceUsdt: null,
      reservedMarginUsdt: 0,
    };
  }
  if (!strategy?.definition?.eventSequence) {
    return {
      applied: false,
      reason: "not_event_sequence",
      balanceUsdt: null,
      availableBalanceUsdt: null,
      reservedMarginUsdt: 0,
    };
  }
  const realized = computeEventSequencePaperRealizedBalance(session);
  const available = computeEventSequencePaperAvailableBalance({
    realizedBalance: realized,
    openPositions: getOpenPositions(),
  });
  replacePaperAccountBalances({
    balanceUsdt: realized,
    availableBalanceUsdt: available,
  });
  return {
    applied: true,
    reason: "session_realized_equity",
    balanceUsdt: realized,
    availableBalanceUsdt: available,
    reservedMarginUsdt: 0,
  };
}
