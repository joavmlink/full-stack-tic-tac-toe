import { z } from 'zod';

// Single source of truth for the API input/output rules. Controllers, the model and the
// DTO types below derive from these schemas and never repeat validations.

export const WinnerSchema = z.enum(['You', 'AI', 'Draw']);

export const MatchSchema = z.object({
  id: z.number().int().positive(),
  winner: WinnerSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
});

/** A positive PostgreSQL INTEGER received as a string (path or query parameter). */
const PositiveIntParam = (message: string) =>
  z.string().regex(/^\d+$/, message).transform(Number).pipe(z.number().int().positive().max(2_147_483_647));

export const MatchIdParamsSchema = z.object({
  id: PositiveIntParam('The id must be a positive integer'),
});

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const MatchListQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a positive integer')
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_PAGE_SIZE))
    .default(DEFAULT_PAGE_SIZE),
  /** Cursor: id of the last match of the previous page. */
  before: PositiveIntParam('before must be a match id').optional(),
});

export const FinishMatchBodySchema = z.strictObject({
  winner: WinnerSchema,
});

export const MatchStatsSchema = z.object({
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  unfinished: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type Winner = z.infer<typeof WinnerSchema>;
export type Match = z.infer<typeof MatchSchema>;
export type MatchStats = z.infer<typeof MatchStatsSchema>;
export type MatchListQuery = z.infer<typeof MatchListQuerySchema>;
export type FinishMatchBody = z.infer<typeof FinishMatchBodySchema>;
