'use client';

import { motion, useTransform } from 'framer-motion';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';

export function formatClock(seconds?: number): string {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}

/**
 * Elapsed time as mm:ss. The text is driven by a motion value, so it ticks
 * without re-rendering the parent component.
 */
export function PlaybackTime({ active = true, className }: { active?: boolean; className?: string }) {
  const { currentTimeMV } = useAudioPlayer();
  const text = useTransform(currentTimeMV, formatClock);
  return <motion.span className={className}>{active ? text : '00:00'}</motion.span>;
}
