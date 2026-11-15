'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { usePlayerStore } from '@/store/usePlayerStore';

// The EQ and Focus overlays are large and closed most of the time, so their
// code is downloaded only the first time each one is opened. After that they
// stay mounted so their close animations still play.
const StudioEqualizerModal = dynamic(
  () => import('@/components/player/StudioEqualizerModal').then((m) => m.StudioEqualizerModal),
  { ssr: false }
);
const FocusStudioModal = dynamic(
  () => import('@/components/player/FocusStudioModal').then((m) => m.FocusStudioModal),
  { ssr: false }
);

export function LazyOverlays() {
  const isEqOpen = usePlayerStore((s) => s.isEqOpen);
  const isFocusMode = usePlayerStore((s) => s.isFocusMode);
  const [eqUsed, setEqUsed] = useState(isEqOpen);
  const [focusUsed, setFocusUsed] = useState(isFocusMode);

  if (isEqOpen && !eqUsed) setEqUsed(true);
  if (isFocusMode && !focusUsed) setFocusUsed(true);

  return (
    <>
      {focusUsed && <FocusStudioModal />}
      {eqUsed && <StudioEqualizerModal />}
    </>
  );
}
