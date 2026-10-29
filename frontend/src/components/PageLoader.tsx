import { motion } from 'motion/react';

/**
 * Shown while a page chunk downloads. It fades in after a short delay, so fast loads
 * don't flash a spinner.
 */
export default function PageLoader() {
  return (
    <main className="flex flex-1 items-center justify-center" role="status" data-testid="page-loader">
      <motion.div
        className="size-12 animate-spin rounded-full border-4 border-white/15 border-t-you"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      />
      <span className="sr-only">Loading…</span>
    </main>
  );
}
