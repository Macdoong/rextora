export type BacktestPrimaryActionCallbacks = {
  returnToReady: () => void;
  runExplicitly: () => void | Promise<void>;
};

export function executeBacktestPrimaryAction(
  reviewingSavedResult: boolean,
  callbacks: BacktestPrimaryActionCallbacks,
): void {
  if (reviewingSavedResult) {
    callbacks.returnToReady();
    return;
  }
  void callbacks.runExplicitly();
}
