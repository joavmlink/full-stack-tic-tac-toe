import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FunButton, FunLink } from './FunButton';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Safety net for unexpected rendering errors (bugs, malformed data): shows a friendly screen
 * instead of a blank page. React only supports error boundaries as class components.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unexpected UI error:', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex flex-1 flex-col items-center justify-center">
        <div role="alert" data-testid="error-boundary" className="glass w-full max-w-sm rounded-3xl p-7 text-center">
          <p className="text-6xl" aria-hidden="true">
            💥
          </p>
          <h1 className="mt-3 text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-white/70">An unexpected error broke this screen. Your saved matches are safe.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {/* A full reload also resets the stores, which may still hold the data that broke the screen. */}
            <FunButton onClick={() => window.location.reload()}>Try again</FunButton>
            <FunLink to="/" variant="ghost">
              Back to menu
            </FunLink>
          </div>
        </div>
      </main>
    );
  }
}
