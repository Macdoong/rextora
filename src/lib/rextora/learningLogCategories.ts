import type { LearningLogItem } from "./types";

export function isLearningTradeLog(log: LearningLogItem): boolean {
  return log.eventCategory === "거래 기록";
}

export function isLearningCandidateLog(log: LearningLogItem): boolean {
  return log.eventCategory === "후보 기록";
}

export function isLearningReflectionLog(log: LearningLogItem): boolean {
  return log.eventCategory === "학습 반영";
}

export function isLearningSystemLog(log: LearningLogItem): boolean {
  return log.eventCategory === "시스템 이벤트";
}
