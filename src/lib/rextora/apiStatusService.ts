import { apiStatusSeed } from "./seedData";
import { validateSafeStrategyHash } from "./strategyRepository";
import { getTpSlStatus } from "./tpSlManager";
import { hasBinanceCredentials, hasTelegramCredentials } from "./env";
import { getReadOnlyHealth } from "./binance/binanceReadOnlyService";
import type { ApiStatus, PermissionStatus } from "./types";

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]);
}

export async function refreshApiStatus(): Promise<ApiStatus> {
  const hash = validateSafeStrategyHash();
  const health = await getReadOnlyHealth();

  return {
    ...apiStatusSeed,
    binanceFuturesConnected: health.configured && health.readPermission === "정상",
    readPermission: health.readPermission as PermissionStatus,
    futuresPermission: health.futuresAccountRead as PermissionStatus,
    orderPermission: "차단",
    strategyHashValid: hash.ok,
    realOrderEngineConnected: false,
    serverTpSlActive: getTpSlStatus("LIVE").active,
    configured: {
      binanceApiKey: hasBinanceCredentials(),
      binanceApiSecret: hasBinanceCredentials(),
      binanceTestnet: process.env.BINANCE_TESTNET !== "false",
      telegramToken: hasTelegramCredentials(),
      telegramChatId: hasTelegramCredentials()
    },
    serviceState: hasBinanceCredentials() ? "read-only" : "mock"
  };
}

export function getApiStatus(): ApiStatus {
  const hash = validateSafeStrategyHash();
  const hasKey = hasEnv("BINANCE_API_KEY");
  const hasSecret = hasEnv("BINANCE_API_SECRET");

  return {
    ...apiStatusSeed,
    binanceFuturesConnected: hasKey && hasSecret,
    readPermission: hasKey && hasSecret ? "정상" : "미확인",
    futuresPermission: hasKey && hasSecret ? "미확인" : "미확인",
    orderPermission: "차단",
    strategyHashValid: hash.ok,
    configured: {
      binanceApiKey: hasKey,
      binanceApiSecret: hasSecret,
      binanceTestnet: process.env.BINANCE_TESTNET !== "false",
      telegramToken: hasEnv("TG_TOKEN"),
      telegramChatId: hasEnv("TG_CHAT_ID")
    },
    serviceState: "read-only"
  };
}

export const checkReadPermission = () => getApiStatus().readPermission;
export const checkFuturesPermission = () => getApiStatus().futuresPermission;
export const checkOrderPermission = () => getApiStatus().orderPermission;
export const checkIpRestriction = () => getApiStatus().ipRestriction;
export const checkBalanceFetchStatus = () => ({ ok: getApiStatus().readPermission === "정상", status: getApiStatus().lastBalanceFetchTime });
export const checkOrderFetchStatus = () => ({ ok: false, status: getApiStatus().lastOrderFetchTime, message: "주문 조회는 read-only/mock 상태입니다." });
export const checkRealOrderEngineStatus = () => ({ connected: false, message: "실주문 엔진은 연결되어 있지 않습니다." });
export const checkDummyLoopStatus = () => ({ detected: getApiStatus().dummyLoopDetected });
export const checkServerTpSlStatus = () => ({ ...getTpSlStatus("LIVE"), message: "서버 TP/SL 실주문 구현 전" });
