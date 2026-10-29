const STORAGE_KEY = 'tic-tac-toe-chunk-reload';
/** A second chunk failure within this window means a reload didn't help: show the error screen. */
const MIN_INTERVAL_MS = 10_000;

/**
 * After a new deployment, a tab opened earlier may request page chunks that no longer exist.
 * Reloading fetches the new index.html and its new chunk names. Returns whether to reload,
 * at most once every 10 seconds so a chunk that keeps failing can't cause a reload loop.
 */
export function shouldReloadAfterChunkError(storage: Pick<Storage, 'getItem' | 'setItem'>, now: number): boolean {
  try {
    const last = Number(storage.getItem(STORAGE_KEY));
    if (now - last < MIN_INTERVAL_MS) return false;
    storage.setItem(STORAGE_KEY, String(now));
    return true;
  } catch {
    // Storage unavailable (private mode, blocked site data): without a loop guard, don't reload.
    return false;
  }
}
