import { FunLink } from '../components/FunButton';

export default function NotFoundPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-8xl font-bold text-draw text-glow">404</p>
      <p className="text-xl text-white/70">This square is empty… and so is this page.</p>
      <FunLink to="/" className="mt-4">
        Back to menu
      </FunLink>
    </main>
  );
}
