import { motion } from 'motion/react';
import type { Mark } from '../game/logic';
import { O_DRAW_S, X_SECOND_STROKE_DELAY_S, X_STROKE_S } from '../game/mark-animation';

interface MarkIconProps {
  mark: Mark;
  className?: string;
  /** Animates the stroke when the mark appears. */
  animated?: boolean;
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 14,
  strokeLinecap: 'round',
  fill: 'none',
} as const;

export default function MarkIcon({ mark, className, animated = true }: MarkIconProps) {
  const initial = animated ? { pathLength: 0, opacity: 0 } : false;
  const animate = { pathLength: 1, opacity: 1 };

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {mark === 'X' ? (
        <>
          <motion.path
            d="M24 24 L76 76"
            {...stroke}
            initial={initial}
            animate={animate}
            transition={{ duration: X_STROKE_S, ease: 'easeOut' }}
          />
          <motion.path
            d="M76 24 L24 76"
            {...stroke}
            initial={initial}
            animate={animate}
            transition={{ duration: X_STROKE_S, ease: 'easeOut', delay: X_SECOND_STROKE_DELAY_S }}
          />
        </>
      ) : (
        <motion.circle
          cx="50"
          cy="50"
          r="28"
          {...stroke}
          initial={initial}
          animate={animate}
          transition={{ duration: O_DRAW_S, ease: 'easeOut' }}
          style={{ rotate: -90 }}
        />
      )}
    </svg>
  );
}
