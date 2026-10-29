import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { shouldReloadAfterChunkError } from './lib/chunk-reload';

// Vite fires this when a lazy page chunk fails to load (typically after a new deployment).
// Otherwise the error reaches the ErrorBoundary, whose "Try again" also reloads.
window.addEventListener('vite:preloadError', () => {
  if (shouldReloadAfterChunkError(window.sessionStorage, Date.now())) window.location.reload();
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
