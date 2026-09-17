/**
 * Process-local write serialization for auth stores.
 *
 * JavaScript is single-threaded: a synchronous critical section cannot
 * interleave with another. These gates make that contract explicit and
 * fail closed on accidental re-entry (which would hide a nested RMW).
 *
 * This does NOT protect against a second OS process writing the same JSON
 * files. Cross-process locking is not implemented.
 */

export type ProcessLocalWriteGate = {
  run: <T>(fn: () => T) => T;
};

export function createProcessLocalWriteGate(storeName: string): ProcessLocalWriteGate {
  let locked = false;

  return {
    run<T>(fn: () => T): T {
      if (locked) {
        throw new Error(
          `auth ${storeName} write gate re-entered — nested mutation is not allowed`,
        );
      }
      locked = true;
      try {
        return fn();
      } finally {
        locked = false;
      }
    },
  };
}

export const userStoreWriteGate = createProcessLocalWriteGate("users");
export const sessionStoreWriteGate = createProcessLocalWriteGate("sessions");
