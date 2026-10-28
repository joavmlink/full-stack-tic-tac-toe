import { AnimatePresence } from 'motion/react';
import { useEffect } from 'react';
import Board, { type BoardState } from '../components/Board';
import CoinFlip from '../components/CoinFlip';
import { difficultyInfo } from '../components/DifficultySelector';
import { FunButton, FunLink } from '../components/FunButton';
import PageHeader from '../components/PageHeader';
import ResultModal from '../components/ResultModal';
import TurnIndicator from '../components/TurnIndicator';
import { useGameStore } from '../store/game-store';
import { useSettingsStore } from '../store/settings-store';

export default function PlayPage() {
  const status = useGameStore((s) => s.status);
  const board = useGameStore((s) => s.board);
  const humanMark = useGameStore((s) => s.humanMark);
  const aiMark = useGameStore((s) => s.aiMark);
  const starter = useGameStore((s) => s.starter);
  const turn = useGameStore((s) => s.turn);
  const result = useGameStore((s) => s.result);
  const winningLine = useGameStore((s) => s.winningLine);
  const saveStatus = useGameStore((s) => s.saveStatus);
  const error = useGameStore((s) => s.error);
  const startMatch = useGameStore((s) => s.startMatch);
  const playHuman = useGameStore((s) => s.playHuman);
  const retrySave = useGameStore((s) => s.retrySave);
  const abandon = useGameStore((s) => s.abandon);
  const difficulty = useSettingsStore((s) => s.difficulty);

  useEffect(() => {
    void startMatch();
    return abandon;
  }, [startMatch, abandon]);

  const level = difficultyInfo(difficulty);
  const header = (
    <PageHeader
      title="Let's play!"
      aside={
        <span className="glass rounded-full px-3 py-1.5 text-sm text-white/80" data-testid="difficulty-chip">
          <span aria-hidden="true">{level.emoji}</span> AI: {level.label}
        </span>
      }
    />
  );

  if (status === 'error') {
    return (
      <main className="flex flex-1 flex-col">
        {header}
        <div role="alert" className="glass mx-auto mt-8 w-full max-w-sm rounded-3xl p-7 text-center">
          <p className="text-6xl" aria-hidden="true">
            😵
          </p>
          <h2 className="mt-3 text-2xl font-bold">Couldn't start the match</h2>
          <p className="mt-2 text-white/70">{error}</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <FunButton onClick={() => void startMatch()}>Retry</FunButton>
            <FunLink to="/" variant="ghost">
              Menu
            </FunLink>
          </div>
        </div>
      </main>
    );
  }

  const boardState: BoardState =
    status === 'finished' ? 'finished' : status === 'playing' ? (turn === 'you' ? 'your-turn' : 'ai-turn') : 'waiting';

  const statusText =
    status === 'starting' || status === 'idle'
      ? 'Getting the match ready…'
      : status === 'flipping'
        ? 'Flipping a coin…'
        : status === 'finished'
          ? 'Match over'
          : turn === 'you'
            ? 'Your turn: pick a square'
            : 'The AI is thinking…';

  return (
    <main className="flex flex-1 flex-col">
      {header}

      <div className="flex flex-1 flex-col items-center gap-6">
        <TurnIndicator humanMark={humanMark} aiMark={aiMark} active={status === 'playing' ? turn : null} />
        <Board
          board={board}
          humanMark={humanMark}
          state={boardState}
          winningLine={winningLine}
          winnerIsYou={result === 'You'}
          onPlay={playHuman}
        />
        <p data-testid="game-status" aria-live="polite" className="min-h-6 text-white/70">
          {statusText}
        </p>
      </div>

      <AnimatePresence>
        {status === 'flipping' && starter && <CoinFlip key="coin" starter={starter} />}
        {status === 'finished' && result && (
          <ResultModal
            key="result"
            result={result}
            saveStatus={saveStatus}
            onRematch={() => void startMatch()}
            onRetrySave={() => void retrySave()}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
