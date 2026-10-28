import { motion } from 'motion/react';
import { Link } from 'react-router';
import { cn } from '../lib/cn';
import { formatDuration, formatMatchDate, resultInfo } from '../lib/match-format';
import type { Match } from '../types/match';

export const TONE_CLASSES: Record<string, { badge: string; text: string }> = {
  you: { badge: 'bg-you/15 ring-you/40', text: 'text-you' },
  ai: { badge: 'bg-ai/15 ring-ai/40', text: 'text-ai' },
  draw: { badge: 'bg-draw/15 ring-draw/40', text: 'text-draw' },
  muted: { badge: 'bg-white/5 ring-white/15', text: 'text-white/60' },
};

const MotionLink = motion.create(Link);

export default function MatchCard({ match, index }: { match: Match; index: number }) {
  const info = resultInfo(match.winner);
  const tone = TONE_CLASSES[info.tone] ?? TONE_CLASSES.muted!;
  const duration = formatDuration(match.createdAt, match.finishedAt);

  return (
    <li>
      <MotionLink
        to={`/history/${match.id}`}
        data-testid="match-card"
        data-id={match.id}
        data-result={match.winner ?? 'unfinished'}
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: Math.min(index, 12) * 0.04 }}
        whileHover={{ x: 4 }}
        className="glass group flex items-center gap-4 rounded-2xl px-4 py-3 transition-colors hover:bg-white/10"
      >
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl text-2xl ring-1', tone.badge)} aria-hidden="true">
          {info.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn('text-lg font-bold', tone.text)}>{info.label}</span>
            <span className="text-sm text-white/45">Match #{match.id}</span>
          </p>
          <p className="truncate text-sm text-white/65">
            {formatMatchDate(match.createdAt)}
            {duration && <span className="text-white/45"> · {duration}</span>}
          </p>
        </div>
        <span className="text-xl text-white/30 transition group-hover:translate-x-1 group-hover:text-white/70" aria-hidden="true">
          ›
        </span>
      </MotionLink>
    </li>
  );
}
