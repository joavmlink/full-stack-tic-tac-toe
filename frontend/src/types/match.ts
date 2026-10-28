export type Winner = 'You' | 'AI' | 'Draw';

export interface Match {
  id: number;
  winner: Winner | null;
  /** ISO 8601 with a -03:00 offset */
  createdAt: string;
  finishedAt: string | null;
}

/** Totals over every match (GET /api/matches/stats). */
export interface MatchCounts {
  wins: number;
  losses: number;
  draws: number;
  unfinished: number;
  total: number;
}
