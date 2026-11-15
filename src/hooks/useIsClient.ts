"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * True once rendering on the client (false during SSR and hydration), without
 * the extra render a `useEffect(() => setMounted(true), [])` costs. Use it to
 * gate portals and other browser-only output.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
