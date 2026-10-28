import { motion } from 'motion/react';
import type { Cell as CellValue, Mark } from '../game/logic';
import { cn } from '../lib/cn';
import MarkIcon from './MarkIcon';

interface CellProps {
  index: number;
  value: CellValue;
  humanMark: Mark;
  playable: boolean;
  locked: boolean;
  winning: boolean;
  onPlay: (index: number) => void;
}

export default function Cell({ index, value, humanMark, playable, locked, winning, onPlay }: CellProps) {
  const isYours = value === humanMark;
  const owner = value === null ? 'empty' : isYours ? `${value}, yours` : `${value}, the AI's`;
  const row = Math.floor(index / 3) + 1;
  const col = (index % 3) + 1;

  return (
    <motion.button
      type="button"
      data-testid={`cell-${index}`}
      data-empty={value === null}
      aria-label={`Row ${row}, column ${col}: ${owner}`}
      // Taken square or finished match → disabled. If it's only the AI's turn, it stays
      // focusable (aria-disabled) so keyboard users don't lose focus.
      disabled={value !== null || locked}
      aria-disabled={!playable}
      onClick={() => onPlay(index)}
      whileTap={playable ? { scale: 0.9 } : undefined}
      animate={winning ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={winning ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : undefined}
      className={cn(
        'group relative grid aspect-square place-items-center rounded-2xl border transition-colors duration-200',
        'border-white/10 bg-white/[0.04]',
        playable && 'cursor-pointer hover:border-you/50 hover:bg-you/10',
        !playable && value === null && 'cursor-default',
        winning && (isYours ? 'border-you/70 bg-you/15' : 'border-ai/70 bg-ai/15'),
      )}
    >
      {/* Different keys: without them React would reuse the (already drawn) preview as the
          real mark and its entry animation would never run. */}
      {value ? (
        <MarkIcon
          key="mark"
          mark={value}
          className={cn('size-[68%]', isYours ? 'text-you glow-you' : 'text-ai glow-ai')}
        />
      ) : (
        playable && (
          <MarkIcon
            key="preview"
            mark={humanMark}
            animated={false}
            className="size-[56%] text-you opacity-0 transition-opacity duration-150 group-hover:opacity-30 group-focus-visible:opacity-30"
          />
        )
      )}
    </motion.button>
  );
}
