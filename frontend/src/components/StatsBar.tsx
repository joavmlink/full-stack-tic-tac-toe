import { motion } from 'motion/react';
import type { MatchStats } from '../lib/match-format';
import { cn } from '../lib/cn';

export default function StatsBar({ stats }: { stats: MatchStats }) {
  const tiles = [
    { key: 'wins', label: 'Wins', value: stats.wins, className: 'text-you' },
    { key: 'losses', label: 'Losses', value: stats.losses, className: 'text-ai' },
    { key: 'draws', label: 'Draws', value: stats.draws, className: 'text-draw' },
    { key: 'rate', label: 'Win rate', value: `${stats.winRate}%`, className: 'text-white' },
  ];

  return (
    <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile, index) => (
        <motion.div
          key={tile.key}
          data-testid={`stat-${tile.key}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.06 }}
          className="glass rounded-2xl px-4 py-3 text-center"
        >
          <dt className="text-xs uppercase tracking-widest text-white/55">{tile.label}</dt>
          <dd className={cn('mt-1 text-3xl font-bold tabular-nums text-glow', tile.className)}>{tile.value}</dd>
        </motion.div>
      ))}
    </dl>
  );
}
