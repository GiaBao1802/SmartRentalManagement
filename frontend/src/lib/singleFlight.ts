export function createSingleFlightGate() {
  let pending = false;
  return async (action: () => Promise<void>) => {
    if (pending) return false;
    pending = true;
    try { await action(); return true; }
    finally { pending = false; }
  };
}
