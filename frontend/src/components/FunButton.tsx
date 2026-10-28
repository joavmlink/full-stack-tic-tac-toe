import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../lib/cn';

type Variant = 'you' | 'ai' | 'ghost';
type Size = 'md' | 'lg';

const BASE =
  'relative inline-flex select-none items-center justify-center gap-3 rounded-2xl font-semibold tracking-wide ' +
  'transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<Variant, string> = {
  you:
    'bg-linear-to-br from-you to-you-deep text-white ' +
    'shadow-[0_6px_0_0_#86198f,0_18px_40px_-14px_var(--color-you)]',
  ai:
    'bg-linear-to-br from-ai to-ai-deep text-night ' +
    'shadow-[0_6px_0_0_#155e75,0_18px_40px_-14px_var(--color-ai)]',
  ghost: 'glass text-white/90 hover:bg-white/10',
};

const SIZES: Record<Size, string> = {
  md: 'px-5 py-3 text-base',
  lg: 'w-full px-6 py-4 text-xl',
};

// "Squishy" effect: lifts on hover and squashes when pressed.
const interaction = {
  whileHover: { y: -2, scale: 1.02 },
  whileTap: { y: 4, scale: 0.96 },
  transition: { type: 'spring', stiffness: 500, damping: 22 },
} as const;

interface StyleProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function FunButton({
  variant = 'you',
  size = 'md',
  className,
  children,
  type = 'button',
  ...props
}: StyleProps & Omit<HTMLMotionProps<'button'>, 'children'>) {
  return (
    <motion.button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...interaction}
      {...props}
    >
      {children}
    </motion.button>
  );
}

const MotionLink = motion.create(Link);

export function FunLink({
  to,
  variant = 'you',
  size = 'md',
  className,
  children,
}: StyleProps & { to: string }) {
  return (
    <MotionLink to={to} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...interaction}>
      {children}
    </MotionLink>
  );
}
