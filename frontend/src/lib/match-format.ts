import type { MatchCounts, Winner } from '../types/match';

export const RESULT_INFO: Record<Winner | 'unfinished', { label: string; emoji: string; tone: string }> = {
  You: { label: 'Win', emoji: '🏆', tone: 'you' },
  AI: { label: 'Loss', emoji: '🤖', tone: 'ai' },
  Draw: { label: 'Draw', emoji: '🤝', tone: 'draw' },
  unfinished: { label: 'Unfinished', emoji: '⏸️', tone: 'muted' },
};

export function resultInfo(winner: Winner | null) {
  return RESULT_INFO[winner ?? 'unfinished'];
}

// Dates are shown in the same time zone the API uses (UTC-3, Argentina).
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatMatchDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** Human-readable duration between two ISO dates, e.g. "1m 05s" or "42s". */
export function formatDuration(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null;
  const totalSeconds = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

export interface MatchStats {
  wins: number;
  losses: number;
  draws: number;
  finished: number;
  /** Win percentage over finished matches (integer 0–100). */
  winRate: number;
}

/** Stats shown in the history, from the API totals (which cover every match, not just one page). */
export function toMatchStats({ wins, losses, draws }: Pick<MatchCounts, 'wins' | 'losses' | 'draws'>): MatchStats {
  const finished = wins + losses + draws;
  return { wins, losses, draws, finished, winRate: finished ? Math.round((wins / finished) * 100) : 0 };
}
