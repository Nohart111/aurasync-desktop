"use client";

import { useCallback, useEffect, useState } from "react";
import {
  pipedClient,
  PipedRequestError,
  type PipedSearchResult,
} from "@/core/services/PipedClient";

interface PipedSearchState {
  query: string;
  results: PipedSearchResult[];
  isLoading: boolean;
  isRetrying: boolean;
  error: string | null;
  attempts: number;
}

interface UsePipedSearchOptions {
  enabled?: boolean;
  debounceMs?: number;
}

export function usePipedSearch(
  query: string,
  { enabled = true, debounceMs = 350 }: UsePipedSearchOptions = {}
) {
  const [state, setState] = useState<PipedSearchState>({
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
    if (!enabled || !normalizedQuery) {
      return;
    }

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
      }, 650);

      void pipedClient
        .search(normalizedQuery, controller.signal)
        .then((response) => {
          setState({
            query: requestKey,
            results: response.items,
            isLoading: false,
            isRetrying: false,
            error: null,
            attempts: response.attempts,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message =
            error instanceof PipedRequestError || error instanceof Error
              ? error.message
              : "Piped search failed. Please try again.";
          setState({
            query: requestKey,
            results: [],
            isLoading: false,
            isRetrying: false,
            error: message,
            attempts: error instanceof PipedRequestError ? error.attempts : 0,
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
