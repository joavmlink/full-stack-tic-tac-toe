export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Board = readonly Cell[];
export type Line = readonly [number, number, number];

export const BOARD_SIZE = 9;

export const WIN_LINES: readonly Line[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function createEmptyBoard(): Cell[] {
  return Array.from({ length: BOARD_SIZE }, () => null);
}

export function otherMark(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X';
}

export function getWinner(board: Board): { mark: Mark; line: Line } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const mark = board[a];
    if (mark && mark === board[b] && mark === board[c]) return { mark, line };
  }
  return null;
}

export function availableMoves(board: Board): number[] {
  const moves: number[] = [];
  board.forEach((cell, index) => {
    if (cell === null) moves.push(index);
  });
  return moves;
}

export function isDraw(board: Board): boolean {
  return getWinner(board) === null && board.every((cell) => cell !== null);
}

/** Returns a new board with the move applied. */
export function placeMark(board: Board, index: number, mark: Mark): Cell[] {
  if (index < 0 || index >= BOARD_SIZE || board[index] !== null) {
    throw new Error(`Invalid move on square ${index}`);
  }
  const next = [...board];
  next[index] = mark;
  return next;
}
