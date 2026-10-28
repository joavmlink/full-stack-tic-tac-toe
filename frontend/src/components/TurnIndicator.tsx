import { motion } from 'motion/react';
import type { Mark } from '../game/logic';
import { cn } from '../lib/cn';
import type { Player } from '../store/game-store';
import MarkIcon from './MarkIcon';

interface TurnIndicatorProps {
  humanMark: Mark;
  aiMark: Mark;
  /** Active player, or null when nobody is playing (coin flip / finished match). */
  active: Player | null;
}

function ThinkingDots() {
  return (
    <span className="ml-1 inline-flex gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-blink rounded-full bg-ai" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

function PlayerBadge({ player, mark, active }: { player: Player; mark: Mark; active: boolean }) {
  const isYou = player === 'you';
  return (
    <motion.div
      animate={{ scale: active ? 1.06 : 0.96, opacity: active ? 1 : 0.55 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'glass flex flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4',
        active && (isYou ? 'ring-2 ring-you shadow-[0_0_30px_-6px_var(--color-you)]' : 'ring-2 ring-ai shadow-[0_0_30px_-6px_var(--color-ai)]'),
      )}
    >
      <span className="text-2xl sm:text-3xl" aria-hidden="true">
        {isYou ? '😎' : '🤖'}
      </span>
      <div className="min-w-0 text-left">
        <p className={cn('text-lg font-bold leading-none', isYou ? 'text-you' : 'text-ai')}>{isYou ? 'YOU' : 'AI'}</p>
        <p className="mt-1 flex items-center text-xs text-white/60">
          {active ? (isYou ? 'Your turn' : 'Thinking') : 'Waiting'}
          {active && !isYou && <ThinkingDots />}
        </p>
      </div>
      <MarkIcon mark={mark} animated={false} className={cn('ml-auto size-7', isYou ? 'text-you' : 'text-ai')} />
    </motion.div>
  );
}

export default function TurnIndicator({ humanMark, aiMark, active }: TurnIndicatorProps) {
  return (
    <div data-testid="turn-indicator" data-turn={active ?? 'none'} className="flex w-full max-w-[26rem] items-center gap-3">
      <PlayerBadge player="you" mark={humanMark} active={active === 'you'} />
      <span className="text-sm font-bold text-white/40">VS</span>
      <PlayerBadge player="ai" mark={aiMark} active={active === 'ai'} />
    </div>
  );
}
