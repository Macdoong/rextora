/**
 * Optional cooperative scheduling hooks for long backtest bar walks.
 * Default omitted → synchronous behavior unchanged (Strategy Search only).
 */

export type BacktestCooperativeCheckpoint = {
  barInterval: number;
  onBarCheckpoint: (barIndex: number) => void | Promise<void>;
};

export function assertNoCooperativeCheckpointOnSyncPath(
  checkpoint: BacktestCooperativeCheckpoint | undefined | null,
  syncExportName: string,
  cooperativeExportName: string,
): void {
  if (checkpoint) {
    throw new Error(
      `${syncExportName} cannot use cooperativeCheckpoint — call ${cooperativeExportName} instead`,
    );
  }
}
