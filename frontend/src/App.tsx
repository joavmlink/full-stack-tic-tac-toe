import { MotionConfig } from 'motion/react';
import { Route, Routes, useLocation } from 'react-router';
import AnimatedBackground from './components/AnimatedBackground';
import ErrorBoundary from './components/ErrorBoundary';
import HistoryPage from './pages/HistoryPage';
import MatchDetailPage from './pages/MatchDetailPage';
import MenuPage from './pages/MenuPage';
import NotFoundPage from './pages/NotFoundPage';
import PlayPage from './pages/PlayPage';

export default function App() {
  const { pathname } = useLocation();

  return (
    // "user": respects prefers-reduced-motion in every motion animation.
    <MotionConfig reducedMotion="user">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:py-10">
        {/* Keyed by route: navigating away from a broken screen clears the error. */}
        <ErrorBoundary key={pathname}>
          <Routes>
            <Route index element={<MenuPage />} />
            <Route path="play" element={<PlayPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="history/:id" element={<MatchDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </MotionConfig>
  );
}
