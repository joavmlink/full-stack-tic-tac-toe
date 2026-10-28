import { motion } from 'motion/react';
import DifficultySelector from '../components/DifficultySelector';
import { FunLink } from '../components/FunButton';
import MarkIcon from '../components/MarkIcon';

const TITLE = ['TIC', '·', 'TAC', '·', 'TOE'];
const TITLE_COLORS = ['text-you', 'text-white/40', 'text-draw', 'text-white/40', 'text-ai'];

export default function MenuPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 py-6 text-center">
      <header className="flex flex-col items-center">
        <div className="mb-4 flex items-center gap-5" aria-hidden="true">
          <motion.div
            animate={{ y: [0, -8, 0], rotate: [0, -8, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <MarkIcon mark="X" className="size-14 text-you glow-you sm:size-16" />
          </motion.div>
          <span className="text-lg font-bold text-white/40">vs</span>
          <motion.div
            animate={{ y: [0, -8, 0], rotate: [0, 8, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 1.3 }}
          >
            <MarkIcon mark="O" className="size-14 text-ai glow-ai sm:size-16" />
          </motion.div>
        </div>

        <h1 className="flex items-center gap-1 text-5xl font-bold tracking-tight sm:gap-2 sm:text-7xl" aria-label="Tic-Tac-Toe">
          {TITLE.map((part, index) => (
            <motion.span
              key={index}
              aria-hidden="true"
              className={`${TITLE_COLORS[index]} text-glow inline-block cursor-default`}
              initial={{ y: -90, opacity: 0, rotate: -25 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.1 + index * 0.08 }}
              whileHover={{ y: -10, rotate: index % 2 ? 10 : -10, scale: 1.1 }}
            >
              {part}
            </motion.span>
          ))}
        </h1>

        <motion.p
          className="mt-4 text-lg text-white/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          The timeless classic: <span className="font-semibold text-you">YOU</span> vs{' '}
          <span className="font-semibold text-ai">AI</span>
        </motion.p>
      </header>

      <motion.nav
        aria-label="Main menu"
        className="flex w-full max-w-sm flex-col gap-5"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
      >
        <FunLink to="/play" variant="you" size="lg">
          <span aria-hidden="true">🎮</span>
          Play
        </FunLink>
        <FunLink to="/history" variant="ai" size="lg">
          <span aria-hidden="true">📜</span>
          Match History
        </FunLink>
      </motion.nav>

      <motion.section
        aria-labelledby="difficulty-title"
        className="glass w-full max-w-sm rounded-3xl p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <h2 id="difficulty-title" className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-white/55">
          AI difficulty
        </h2>
        <DifficultySelector />
      </motion.section>
    </main>
  );
}
