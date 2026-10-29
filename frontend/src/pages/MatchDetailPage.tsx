import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ApiError, errorMessage } from '../api/errors';
import { getMatch } from '../api/matches';
import { FunLink } from '../components/FunButton';
import { TONE_CLASSES } from '../components/MatchCard';
import PageHeader from '../components/PageHeader';
import { cn } from '../lib/cn';
import { formatDuration, formatMatchDate, resultInfo } from '../lib/match-format';
import type { Match } from '../types/match';

type DetailState =
  | { status: 'loading' }
  | { status: 'success'; match: Match }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

export default function MatchDetailPage() {
  const { id = '' } = useParams();
  const [state, setState] = useState<DetailState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    if (!/^\d+$/.test(id)) {
      setState({ status: 'not-found' });
      return;
    }

    getMatch(Number(id))
      .then((match) => !cancelled && setState({ status: 'success', match }))
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 404 || error.status === 400)) setState({ status: 'not-found' });
        else setState({ status: 'error', message: errorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title={`Match #${id}`} backTo="/history" backLabel="Match History" />

      {state.status === 'loading' && <div className="glass mx-auto h-80 w-full max-w-md animate-pulse rounded-[2rem]" />}

      {state.status === 'not-found' && (
        <div role="alert" className="glass mx-auto w-full max-w-md rounded-[2rem] p-7 text-center">
          <p className="text-6xl" aria-hidden="true">
            🔍
          </p>
          <h2 className="mt-3 text-2xl font-bold">Match not found</h2>
          <p className="mt-2 text-white/70">There is no match with id {id}.</p>
          <FunLink to="/history" className="mt-6" variant="ghost">
            Back to match history
          </FunLink>
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="glass mx-auto w-full max-w-md rounded-[2rem] p-7 text-center">
          <h2 className="text-2xl font-bold">Couldn't load the match</h2>
          <p className="mt-2 text-white/70">{state.message}</p>
        </div>
      )}

      {state.status === 'success' && <MatchDetail match={state.match} />}
    </main>
  );
}

function MatchDetail({ match }: { match: Match }) {
  const info = resultInfo(match.winner);
  const tone = TONE_CLASSES[info.tone] ?? TONE_CLASSES.muted!;
  const rows = [
    { label: 'Result', value: info.label },
    { label: 'Started', value: formatMatchDate(match.createdAt) },
    { label: 'Finished', value: match.finishedAt ? formatMatchDate(match.finishedAt) : '—' },
    { label: 'Duration', value: formatDuration(match.createdAt, match.finishedAt) ?? '—' },
  ];

  return (
    <motion.article
      data-testid="match-detail"
      data-result={match.winner ?? 'unfinished'}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="glass mx-auto w-full max-w-md rounded-[2rem] p-7 text-center"
    >
      <motion.div
        className={cn('mx-auto grid size-24 place-items-center rounded-3xl text-6xl ring-1', tone.badge)}
        initial={{ rotate: -20, scale: 0 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 12 }}
        aria-hidden="true"
      >
        {info.emoji}
      </motion.div>
      <h2 className={cn('mt-4 text-4xl font-bold text-glow', tone.text)}>{info.label}</h2>
      <p className="text-white/55">YOU vs AI</p>

      <dl className="mt-6 divide-y divide-white/10 text-left">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 py-3">
            <dt className="text-white/55">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <FunLink to="/history" variant="ghost">
          Match History
        </FunLink>
        <FunLink to="/play">Play again</FunLink>
      </div>
    </motion.article>
  );
}
