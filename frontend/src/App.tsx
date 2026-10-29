import { MotionConfig } from 'motion/react';
import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import AnimatedBackground from './components/AnimatedBackground';
import ErrorBoundary from './components/ErrorBoundary';
import PageLoader from './components/PageLoader';

// One chunk per page: the browser only downloads the code of the screens the user actually visits.
const MenuPage = lazy(() => import('./pages/MenuPage'));
const PlayPage = lazy(() => import('./pages/PlayPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const MatchDetailPage = lazy(() => import('./pages/MatchDetailPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export default function App() {
  const { pathname } = useLocation();

  return (
    // "user": respects prefers-reduced-motion in every motion animation.
    <MotionConfig reducedMotion="user">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:py-10">
        {/* Keyed by route: navigating away from a broken screen clears the error. It also catches
            a page chunk that fails to load. */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route index element={<MenuPage />} />
              <Route path="play" element={<PlayPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="history/:id" element={<MatchDetailPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </MotionConfig>
  );
}
