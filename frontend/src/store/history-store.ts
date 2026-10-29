import { create } from 'zustand';
import { errorMessage } from '../api/errors';
import { getMatchCounts, listMatches } from '../api/matches';
import type { Match, MatchCounts } from '../types/match';

interface HistoryState {
  matches: Match[];
  /** Cursor for the next page, or null when every match is loaded. */
  nextCursor: number | null;
  /** Totals over every match; null if they couldn't be loaded (the list still works). */
  counts: MatchCounts | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
  fetchMatches: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  matches: [],
  nextCursor: null,
  counts: null,
  status: 'idle',
  error: null,
  loadingMore: false,
  loadMoreError: null,

  /** Loads the first page (most recent first) and the totals. */
  fetchMatches: async () => {
    set({ status: 'loading', error: null, loadMoreError: null });
    const [page, counts] = await Promise.allSettled([listMatches(), getMatchCounts()]);
    if (page.status === 'rejected') {
      set({ status: 'error', error: errorMessage(page.reason) });
      return;
    }
    set({
      matches: page.value.matches,
      nextCursor: page.value.nextCursor,
      counts: counts.status === 'fulfilled' ? counts.value : null,
      status: 'success',
    });
  },

  /** Appends the next (older) page. */
  loadMore: async () => {
    const { nextCursor, loadingMore } = get();
    if (nextCursor === null || loadingMore) return;

    set({ loadingMore: true, loadMoreError: null });
    try {
      const page = await listMatches(nextCursor);
      // Ignore the result if the list was reloaded meanwhile.
      if (get().nextCursor === nextCursor) {
        set({ matches: [...get().matches, ...page.matches], nextCursor: page.nextCursor });
      }
    } catch (error) {
      set({ loadMoreError: errorMessage(error) });
    } finally {
      set({ loadingMore: false });
    }
  },
}));
