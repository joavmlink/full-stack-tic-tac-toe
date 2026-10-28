import { availableMoves, getWinner, otherMark, type Board, type Cell, type Mark } from './logic';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type RandomFn = () => number;

/** On "normal" the AI plays the best move with this probability; otherwise it plays at random. */
export const NORMAL_OPTIMAL_PROBABILITY = 0.65;

const WIN_SCORE = 10;

/**
 * Minimax with alpha-beta pruning, scored from `aiMark`'s point of view:
 * winning sooner is better than winning later, and losing later is better than losing sooner.
 */
function minimax(board: Cell[], toMove: Mark, aiMark: Mark, depth: number, alpha: number, beta: number): number {
  const winner = getWinner(board);
  if (winner) return winner.mark === aiMark ? WIN_SCORE - depth : depth - WIN_SCORE;

  const moves = availableMoves(board);
  if (moves.length === 0) return 0;

  const maximizing = toMove === aiMark;
  let best = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    board[move] = toMove;
    const score = minimax(board, otherMark(toMove), aiMark, depth + 1, alpha, beta);
    board[move] = null;

    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, score);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** Every optimal move for `aiMark` (whose turn it is). */
export function bestMoves(board: Board, aiMark: Mark): number[] {
  const scratch = [...board];
  let bestScore = -Infinity;
  let best: number[] = [];

  for (const move of availableMoves(scratch)) {
    scratch[move] = aiMark;
    const score = minimax(scratch, otherMark(aiMark), aiMark, 1, -Infinity, Infinity);
    scratch[move] = null;

    if (score > bestScore) {
      bestScore = score;
      best = [move];
    } else if (score === bestScore) {
      best.push(move);
    }
  }
  return best;
}

function pick<T>(items: readonly T[], random: RandomFn): T {
  const item = items[Math.min(Math.floor(random() * items.length), items.length - 1)];
  if (item === undefined) throw new Error('No moves available');
  return item;
}

export function chooseAiMove(
  board: Board,
  aiMark: Mark,
  difficulty: Difficulty,
  random: RandomFn = Math.random,
): number {
  const moves = availableMoves(board);
  if (moves.length === 0) throw new Error('No moves available');

  switch (difficulty) {
    case 'easy':
      return pick(moves, random);
    case 'normal':
      return random() < NORMAL_OPTIMAL_PROBABILITY ? pick(bestMoves(board, aiMark), random) : pick(moves, random);
    case 'hard':
      // Picks at random among equally good moves, so games aren't always the same.
      return pick(bestMoves(board, aiMark), random);
  }
}
