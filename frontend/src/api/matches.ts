import { nextCursorFromLink } from '../lib/pagination';
import type { Match, MatchCounts, Winner } from '../types/match';
import { apiRequest, apiRequestWithHeaders } from './client';

export interface MatchPage {
  matches: Match[];
  /** Cursor for the next (older) page, or null when there are no more matches. */
  nextCursor: number | null;
}

export const createMatch = () => apiRequest<Match>('/matches', { method: 'POST' });

export const finishMatch = (id: number, winner: Winner) =>
  apiRequest<Match>(`/matches/${id}`, { method: 'PATCH', body: { winner } });

/** One page of matches, most recent first (the API returns 20 per page by default). */
export async function listMatches(before?: number): Promise<MatchPage> {
  const { data, headers } = await apiRequestWithHeaders<Match[]>(
    before === undefined ? '/matches' : `/matches?before=${before}`,
  );
  return { matches: data, nextCursor: nextCursorFromLink(headers.get('Link')) };
}

export const getMatchCounts = () => apiRequest<MatchCounts>('/matches/stats');

export const getMatch = (id: number) => apiRequest<Match>(`/matches/${id}`);
