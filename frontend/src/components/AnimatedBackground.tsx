import type { Mark } from '../game/logic';
import { cn } from '../lib/cn';
import MarkIcon from './MarkIcon';

interface FloatingShape {
  mark: Mark;
  className: string;
  delay: number;
  duration: number;
}

const SHAPES: FloatingShape[] = [
  { mark: 'X', className: 'top-[6%] left-[4%] size-16 text-you', delay: 0, duration: 13 },
  { mark: 'O', className: 'top-[14%] right-[8%] size-20 text-ai', delay: -4, duration: 16 },
  { mark: 'O', className: 'top-[46%] left-[-2%] size-24 text-draw', delay: -8, duration: 18 },
  { mark: 'X', className: 'top-[62%] right-[3%] size-14 text-you', delay: -2, duration: 12 },
  { mark: 'X', className: 'bottom-[6%] left-[18%] size-12 text-ai', delay: -6, duration: 15 },
  { mark: 'O', className: 'bottom-[10%] right-[24%] size-16 text-you', delay: -10, duration: 17 },
  { mark: 'X', className: 'top-[30%] left-[40%] size-10 text-draw', delay: -3, duration: 20 },
];

/** Decorative background with floating X and O marks. */
export default function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {SHAPES.map((shape, index) => (
        <div
          key={index}
          className={cn('absolute animate-float opacity-15 blur-[1px]', shape.className)}
          style={{ animationDelay: `${shape.delay}s`, animationDuration: `${shape.duration}s` }}
        >
          <MarkIcon mark={shape.mark} animated={false} className="size-full" />
        </div>
      ))}
    </div>
  );
}
