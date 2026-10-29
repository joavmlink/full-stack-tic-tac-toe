import { motion } from 'motion/react';
import type { Difficulty } from '../game/ai';
import { cn } from '../lib/cn';
import { useSettingsStore } from '../store/settings-store';

export const DIFFICULTIES: { value: Difficulty; label: string; emoji: string; hint: string }[] = [
  { value: 'easy', label: 'Easy', emoji: '😌', hint: 'The AI plays at random' },
  { value: 'normal', label: 'Normal', emoji: '🙂', hint: 'Plays well, but makes mistakes' },
  { value: 'hard', label: 'Hard', emoji: '🔥', hint: 'Unbeatable: a draw is your best result' },
];

export function difficultyInfo(value: Difficulty) {
  return DIFFICULTIES.find((d) => d.value === value) ?? DIFFICULTIES[1]!;
}

export default function DifficultySelector() {
  const difficulty = useSettingsStore((s) => s.difficulty);
  const setDifficulty = useSettingsStore((s) => s.setDifficulty);

  return (
    <div>
      <div role="radiogroup" aria-label="AI difficulty" className="grid grid-cols-3 gap-1 rounded-2xl bg-black/25 p-1">
        {DIFFICULTIES.map((option) => {
          const selected = option.value === difficulty;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setDifficulty(option.value)}
              className={cn(
                'relative rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors',
                selected ? 'text-night' : 'text-white/70 hover:text-white',
              )}
            >
              {selected && (
                <motion.span
                  layoutId="difficulty-pill"
                  className="absolute inset-0 rounded-xl bg-linear-to-br from-draw to-draw-deep"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative flex items-center justify-center gap-1.5">
                <span aria-hidden="true">{option.emoji}</span>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs text-white/55">{difficultyInfo(difficulty).hint}</p>
    </div>
  );
}
