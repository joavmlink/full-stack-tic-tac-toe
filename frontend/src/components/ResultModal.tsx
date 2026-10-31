import type confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { cn } from '../lib/cn';
import type { SaveStatus } from '../store/game-store';
import type { Winner } from '../types/match';
import { FunButton, FunLink } from './FunButton';

/** Lets the winning line show before revealing the result. */
const REVEAL_DELAY_S = 0.9;

const CONTENT: Record<Winner, { emoji: string; title: string; subtitle: string; titleClass: string }> = {
  You: {
    emoji: '🏆',
    title: 'YOU WIN!',
    subtitle: 'You beat the machine. Unstoppable!',
    titleClass: 'text-you',
  },
  AI: {
    emoji: '🤖',
    title: 'AI wins',
    subtitle: 'Machines 1, humans 0… Rematch?',
    titleClass: 'text-ai',
  },
  Draw: {
    emoji: '🤝',
    title: "It's a draw!",
    subtitle: 'Great minds think alike.',
    titleClass: 'text-draw',
  },
};

// Loaded on the first win only: most visits never need it.
let confettiCannon: Promise<confetti.CreateTypes> | undefined;

function loadConfetti() {
  // No Web Worker: by default confetti creates one from a blob: URL, which the app's
  // Content-Security-Policy blocks in production.
  confettiCannon ??= import('canvas-confetti').then(({ default: lib }) =>
    lib.create(undefined, { resize: true, useWorker: false }),
  );
  return confettiCannon;
}

async function fireConfetti() {
  const colors = ['#f472d0', '#2dd4f0', '#fcd34d', '#ffffff'];
  const shared = { particleCount: 90, spread: 70, startVelocity: 55, colors, disableForReducedMotion: true };
  try {
    const fire = await loadConfetti();
    void fire({ ...shared, angle: 60, origin: { x: 0, y: 0.75 } });
    void fire({ ...shared, angle: 120, origin: { x: 1, y: 0.75 } });
  } catch {
    // Purely decorative: if the chunk can't load, the result screen works without it.
    confettiCannon = undefined;
  }
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'saving') return <p className="text-sm text-white/60">Saving result…</p>;
  if (status === 'saved')
    return (
      <p data-testid="save-ok" className="text-sm text-emerald-300">
        ✓ Result saved to your match history
      </p>
    );
  if (status === 'rejected')
    return (
      <p data-testid="save-rejected" className="text-sm text-amber-300">
        This match can no longer be saved.
      </p>
    );
  if (status === 'failed')
    return (
      <p className="text-sm text-amber-300">
        Couldn't save the result.{' '}
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          Retry
        </button>
      </p>
    );
  return null;
}

interface ResultModalProps {
  result: Winner;
  saveStatus: SaveStatus;
  onRematch: () => void;
  onRetrySave: () => void;
}

export default function ResultModal({ result, saveStatus, onRematch, onRetrySave }: ResultModalProps) {
  const content = CONTENT[result];

  useEffect(() => {
    if (result !== 'You') return;
    const timer = setTimeout(() => void fireConfetti(), REVEAL_DELAY_S * 1000);
    return () => clearTimeout(timer);
  }, [result]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: REVEAL_DELAY_S, duration: 0.25 }}
      className="fixed inset-0 z-50 grid place-items-center bg-night/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        data-testid="result-modal"
        data-result={result}
        initial={{ scale: 0.6, y: 40 }}
        animate={result === 'AI' ? { scale: 1, y: 0, x: [0, -14, 12, -8, 6, 0] } : { scale: 1, y: 0 }}
        transition={{ delay: REVEAL_DELAY_S, type: 'spring', stiffness: 320, damping: 18 }}
        className="glass w-full max-w-sm rounded-[2rem] bg-night-soft/80 p-7 text-center"
      >
        <motion.div
          className="text-7xl"
          aria-hidden="true"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: REVEAL_DELAY_S + 0.15, type: 'spring', stiffness: 300, damping: 12 }}
        >
          {content.emoji}
        </motion.div>
        <h2 id="result-title" className={cn('mt-3 text-4xl font-bold text-glow', content.titleClass)}>
          {content.title}
        </h2>
        <p className="mt-2 text-white/75">{content.subtitle}</p>

        <div className="mt-4 min-h-5" aria-live="polite">
          <SaveIndicator status={saveStatus} onRetry={onRetrySave} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <FunButton variant="you" onClick={onRematch} autoFocus>
            Rematch
          </FunButton>
          <FunLink to="/" variant="ghost">
            Menu
          </FunLink>
        </div>
        <Link to="/history" className="mt-4 inline-block text-sm text-white/60 underline-offset-4 hover:text-white hover:underline">
          View match history
        </Link>
      </motion.div>
    </motion.div>
  );
}
