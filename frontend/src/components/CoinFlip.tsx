import { motion } from 'motion/react';
import type { Player } from '../store/game-store';

const SPIN_SECONDS = 1.1;

const faceStyle = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' } as const;

/** A coin that spins and lands on the side of whoever goes first. */
export default function CoinFlip({ starter }: { starter: Player }) {
  // 5 full turns; if the AI goes first, half a turn more to show its face.
  const finalRotation = 360 * 5 + (starter === 'ai' ? 180 : 0);

  return (
    <motion.div
      data-testid="coin-flip"
      data-starter={starter}
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 grid place-items-center bg-night/70 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-6 px-4 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-white/60">Who goes first?</p>
        <div style={{ perspective: 800 }}>
          <motion.div
            className="relative size-36 sm:size-40"
            style={{ transformStyle: 'preserve-3d' }}
            initial={{ rotateY: 0, y: 0 }}
            animate={{ rotateY: finalRotation, y: [0, -70, 0] }}
            transition={{ duration: SPIN_SECONDS, ease: [0.2, 0.7, 0.3, 1] }}
          >
            <div
              style={faceStyle}
              className="absolute inset-0 grid place-items-center rounded-full border-4 border-white/30 bg-linear-to-br from-you to-you-deep shadow-[0_0_50px_-8px_var(--color-you)]"
            >
              <span className="text-4xl font-bold">😎</span>
              <span className="absolute bottom-5 text-sm font-bold tracking-widest">YOU</span>
            </div>
            <div
              style={{ ...faceStyle, transform: 'rotateY(180deg)' }}
              className="absolute inset-0 grid place-items-center rounded-full border-4 border-white/30 bg-linear-to-br from-ai to-ai-deep text-night shadow-[0_0_50px_-8px_var(--color-ai)]"
            >
              <span className="text-4xl font-bold">🤖</span>
              <span className="absolute bottom-5 text-sm font-bold tracking-widest">AI</span>
            </div>
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: SPIN_SECONDS, type: 'spring', stiffness: 400, damping: 18 }}
        >
          <p className={`text-3xl font-bold text-glow ${starter === 'you' ? 'text-you' : 'text-ai'}`}>
            {starter === 'you' ? 'You go first!' : 'AI goes first'}
          </p>
          <p className="mt-1 text-white/70">{starter === 'you' ? 'You play X' : 'You play O'}</p>
        </motion.div>
      </div>
    </motion.div>
  );
}
