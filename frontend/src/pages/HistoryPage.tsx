import { useEffect } from 'react';
import { FunButton, FunLink } from '../components/FunButton';
import MatchCard from '../components/MatchCard';
import PageHeader from '../components/PageHeader';
import StatsBar from '../components/StatsBar';
import { toMatchStats } from '../lib/match-format';
import { useHistoryStore } from '../store/history-store';

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="glass flex animate-pulse items-center gap-4 rounded-2xl px-4 py-3">
          <span className="size-12 rounded-xl bg-white/10" />
          <span className="flex-1 space-y-2">
            <span className="block h-4 w-1/3 rounded bg-white/10" />
            <span className="block h-3 w-1/2 rounded bg-white/5" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function HistoryPage() {
  const matches = useHistoryStore((s) => s.matches);
  const status = useHistoryStore((s) => s.status);
  const error = useHistoryStore((s) => s.error);
  const fetchMatches = useHistoryStore((s) => s.fetchMatches);
  const counts = useHistoryStore((s) => s.counts);
  const nextCursor = useHistoryStore((s) => s.nextCursor);
  const loadingMore = useHistoryStore((s) => s.loadingMore);
  const loadMoreError = useHistoryStore((s) => s.loadMoreError);
  const loadMore = useHistoryStore((s) => s.loadMore);

  useEffect(() => {
    void fetchMatches();
  }, [fetchMatches]);

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Match History"
        subtitle={counts ? `Most recent first · ${counts.total} ${counts.total === 1 ? 'match' : 'matches'}` : 'Most recent first'}
      />

      {status === 'error' ? (
        <div role="alert" className="glass mx-auto mt-8 w-full max-w-sm rounded-3xl p-7 text-center">
          <p className="text-6xl" aria-hidden="true">
            📡
          </p>
          <h2 className="mt-3 text-2xl font-bold">Couldn't load your match history</h2>
          <p className="mt-2 text-white/70">{error}</p>
          <FunButton className="mt-6" onClick={() => void fetchMatches()}>
            Retry
          </FunButton>
        </div>
      ) : status === 'success' && matches.length === 0 ? (
        <div data-testid="history-empty" className="glass mx-auto mt-8 w-full max-w-sm rounded-3xl p-7 text-center">
          <p className="text-6xl" aria-hidden="true">
            🕹️
          </p>
          <h2 className="mt-3 text-2xl font-bold">No matches yet</h2>
          <p className="mt-2 text-white/70">The AI is waiting for you…</p>
          <FunLink to="/play" className="mt-6">
            Play your first match!
          </FunLink>
        </div>
      ) : status === 'success' ? (
        <>
          {counts && <StatsBar stats={toMatchStats(counts)} />}
          <ul data-testid="match-list" className="flex flex-col gap-3">
            {matches.map((match, index) => (
              <MatchCard key={match.id} match={match} index={index} />
            ))}
          </ul>
          {nextCursor !== null && (
            <div className="mt-5 flex flex-col items-center gap-2">
              <FunButton
                variant="ghost"
                data-testid="load-more"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </FunButton>
              {loadMoreError && (
                <p role="status" className="text-sm text-amber-300">
                  Couldn't load more matches: {loadMoreError}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <SkeletonList />
      )}
    </main>
  );
}
