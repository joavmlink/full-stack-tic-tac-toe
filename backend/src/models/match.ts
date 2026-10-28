import type { Pool } from '../db/pool.js';
import { toUtcMinus3Iso } from '../lib/time.js';
import { MatchSchema, MatchStatsSchema, type Match, type MatchStats, type Winner } from '../schemas/matches.js';

const COLUMNS = 'id, winner, created_at, finished_at';

interface MatchRow {
  id: number;
  winner: Winner | null;
  created_at: Date;
  finished_at: Date | null;
}

export interface MatchPage {
  matches: Match[];
  /** Cursor for the next (older) page, or null when this is the last one. */
  nextCursor: number | null;
}

export type FinishResult =
  | { status: 'ok'; match: Match }
  | { status: 'not_found' }
  | { status: 'already_finished' };

export interface MatchModel {
  create(): Promise<Match>;
  findPage(options: { limit: number; before?: number | undefined }): Promise<MatchPage>;
  findById(id: number): Promise<Match | undefined>;
  stats(): Promise<MatchStats>;
  finish(id: number, winner: Winner): Promise<FinishResult>;
}


function toMatch(row: MatchRow): Match {
  return MatchSchema.parse({
    id: row.id,
    winner: row.winner,
    createdAt: toUtcMinus3Iso(row.created_at),
    finishedAt: row.finished_at ? toUtcMinus3Iso(row.finished_at) : null,
  });
}

/** The only layer that knows SQL. Rows are validated with Zod so corrupted data never reaches the API. */
export function createMatchModel(pool: Pool): MatchModel {
  return {
    async create() {
      const { rows } = await pool.query<MatchRow>(`INSERT INTO matches DEFAULT VALUES RETURNING ${COLUMNS}`);
      return toMatch(rows[0]!);
    },

    async findPage({ limit, before }) {
      // Keyset pagination: rows strictly older than the cursor row, in the same order as the index.
      // One extra row tells whether there's a next page. An unknown cursor yields an empty page.
      const { rows } = await pool.query<MatchRow>(
        `SELECT ${COLUMNS} FROM matches
         WHERE $2::int IS NULL
            OR (created_at, id) < (SELECT created_at, id FROM matches WHERE id = $2)
         ORDER BY created_at DESC, id DESC
         LIMIT $1`,
        [limit + 1, before ?? null],
      );
      const hasMore = rows.length > limit;
      const matches = rows.slice(0, limit).map(toMatch);
      return { matches, nextCursor: hasMore ? matches.at(-1)!.id : null };
    },

    async findById(id) {
      const { rows } = await pool.query<MatchRow>(`SELECT ${COLUMNS} FROM matches WHERE id = $1`, [id]);
      return rows[0] ? toMatch(rows[0]) : undefined;
    },

    async stats() {
      const { rows } = await pool.query(
        `SELECT count(*) FILTER (WHERE winner = 'You')::int  AS wins,
                count(*) FILTER (WHERE winner = 'AI')::int   AS losses,
                count(*) FILTER (WHERE winner = 'Draw')::int AS draws,
                count(*) FILTER (WHERE winner IS NULL)::int  AS unfinished,
                count(*)::int                                AS total
         FROM matches`,
      );
      return MatchStatsSchema.parse(rows[0]);
    },

    async finish(id, winner) {
      // Atomic: only an unfinished match can be finished, even with concurrent requests.
      const { rows } = await pool.query<MatchRow>(
        `UPDATE matches SET winner = $1, finished_at = now()
         WHERE id = $2 AND finished_at IS NULL
         RETURNING ${COLUMNS}`,
        [winner, id],
      );
      if (rows[0]) return { status: 'ok', match: toMatch(rows[0]) };

      const { rowCount } = await pool.query('SELECT 1 FROM matches WHERE id = $1', [id]);
      return rowCount ? { status: 'already_finished' } : { status: 'not_found' };
    },
  };
}
