"use client";

import { useCallback, useEffect, useState } from "react";
import {
  youtubeMusic,
  type YoutubeMusicResult,
} from "@/core/services/youtubeMusic";

interface SearchState {
  query: string;
  results: YoutubeMusicResult[];
  isLoading: boolean;
  isRetrying: boolean;
  error: string | null;
  attempts: number;
}

interface UseYoutubeSearchOptions {
  enabled?: boolean;
  debounceMs?: number;
}

export function useYoutubeSearch(
  query: string,
  { enabled = true, debounceMs = 350 }: UseYoutubeSearchOptions = {}
) {
  const [state, setState] = useState<SearchState>({
    query: "",
    results: [],
    isLoading: false,
    isRetrying: false,
    error: null,
    attempts: 0,
  });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!enabled || !normalizedQuery) return;

    const controller = new AbortController();
    const requestKey = normalizedQuery;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    setState({
      query: requestKey,
      results: [],
      isLoading: true,
      isRetrying: false,
      error: null,
      attempts: 0,
    });

    const debounceTimer = setTimeout(() => {
      retryTimer = setTimeout(() => {
        setState((current) =>
          current.query === requestKey && current.isLoading
            ? { ...current, isRetrying: true }
            : current
        );
      }, 700);

      void youtubeMusic
        .search(normalizedQuery, controller.signal)
        .then((results) => {
          setState({
            query: requestKey,
            results,
            isLoading: false,
            isRetrying: false,
            error: null,
            attempts: 1,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            query: requestKey,
            results: [],
            isLoading: false,
            isRetrying: false,
            error: error instanceof Error ? error.message : "YouTube search failed.",
            attempts:
              typeof error === "object" && error !== null && "attempts" in error
                ? Number(error.attempts)
                : 0,
          });
        })
        .finally(() => {
          if (retryTimer) clearTimeout(retryTimer);
        });
    }, debounceMs);

    return () => {
      clearTimeout(debounceTimer);
      if (retryTimer) clearTimeout(retryTimer);
      controller.abort();
    };
  }, [debounceMs, enabled, query, retryNonce]);

  const currentQuery = query.trim();
  const isCurrentResult = state.query === currentQuery;
  const retry = useCallback(() => setRetryNonce((nonce) => nonce + 1), []);

  return {
    query: currentQuery,
    results: enabled && isCurrentResult ? state.results : [],
    isLoading: enabled && Boolean(currentQuery) && (!isCurrentResult || state.isLoading),
    isRetrying: enabled && isCurrentResult && state.isRetrying,
    error: enabled && isCurrentResult ? state.error : null,
    attempts: isCurrentResult ? state.attempts : 0,
    retry,
  };
}
