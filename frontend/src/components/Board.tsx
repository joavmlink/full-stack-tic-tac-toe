import { motion } from 'motion/react';
import type { Board as BoardCells, Line, Mark } from '../game/logic';
import Cell from './Cell';

export type BoardState = 'waiting' | 'your-turn' | 'ai-turn' | 'finished';

interface BoardProps {
  board: BoardCells;
  humanMark: Mark;
  state: BoardState;
  winningLine: Line | null;
  winnerIsYou: boolean;
  onPlay: (index: number) => void;
}

/** Center of a square in a 300×300 viewBox. */
function center(index: number) {
  return { x: 50 + (index % 3) * 100, y: 50 + Math.floor(index / 3) * 100 };
}

function WinningLine({ line, isYou }: { line: Line; isYou: boolean }) {
  const start = center(line[0]);
  const end = center(line[2]);
  // Extends a little past the centers of the end squares.
  const dx = (end.x - start.x) * 0.18;
  const dy = (end.y - start.y) * 0.18;

  return (
    <svg viewBox="0 0 300 300" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <motion.path
        d={`M ${start.x - dx} ${start.y - dy} L ${end.x + dx} ${end.y + dy}`}
        stroke={isYou ? 'var(--color-you)' : 'var(--color-ai)'}
        strokeWidth={10}
        strokeLinecap="round"
        fill="none"
        className={isYou ? 'glow-you' : 'glow-ai'}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeInOut', delay: 0.25 }}
      />
    </svg>
  );
}

export default function Board({ board, humanMark, state, winningLine, winnerIsYou, onPlay }: BoardProps) {
  return (
    <motion.div
      data-testid="board"
      data-state={state}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="glass w-full max-w-[26rem] rounded-[2rem] p-3 sm:p-4"
    >
      <div role="group" aria-label="Tic-tac-toe board" className="relative grid grid-cols-3 gap-2.5 sm:gap-3">
        {board.map((value, index) => (
          <Cell
            key={index}
            index={index}
            value={value}
            humanMark={humanMark}
            playable={state === 'your-turn' && value === null}
            locked={state === 'finished'}
            winning={winningLine?.includes(index) ?? false}
            onPlay={onPlay}
          />
        ))}
        {winningLine && <WinningLine line={winningLine} isYou={winnerIsYou} />}
      </div>
    </motion.div>
  );
}
