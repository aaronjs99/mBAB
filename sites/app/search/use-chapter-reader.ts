"use client";

import { useCallback, useEffect, useState } from "react";
import { isChapterResponse, type ChapterKey, type ChapterResponse } from "./chapter-response";
import type { SearchResult } from "./types";

export type ReaderSelection = { result: SearchResult; query: string; caseSensitive: boolean };
export type ChapterState = {
  data: ChapterResponse | null;
  loading: boolean;
  error: string;
  retryable: boolean;
  retry: () => void;
};

class ChapterRequestError extends Error {
  constructor(message: string, readonly retryable = true) { super(message); }
}

function useChapter(target: ChapterKey | null, session: number): ChapterState {
  const book = target?.book;
  const chapter = target?.chapter;
  const version = target?.version;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: ChapterResponse | null; error: string; retryable: boolean } | null>(null);
  const key = `${session}:${book}:${chapter}:${version}:${attempt}`;

  useEffect(() => {
    if (!book || !chapter || !version) return;
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ book: book!, chapter: String(chapter), version: version! });
        const response = await fetch(`/api/chapter?${params}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error : "This chapter could not be loaded.";
          throw new ChapterRequestError(message, response.status >= 500 || response.status === 429);
        }
        if (!isChapterResponse(payload, { book: book!, chapter: chapter!, version: version! })) {
          throw new ChapterRequestError("The chapter source returned an unreadable response. Please try again.");
        }
        if (!controller.signal.aborted) setResult({ key, data: payload, error: "", retryable: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof DOMException && error.name === "TimeoutError"
          ? "Chapter loading took too long. Please try again."
          : error instanceof TypeError ? "Could not connect to the chapter source. Check your connection and try again."
            : error instanceof Error ? error.message : "This chapter could not be loaded.";
        setResult({ key, data: null, error: message, retryable: !(error instanceof ChapterRequestError) || error.retryable });
      }
    }
    void load();
    return () => controller.abort();
  }, [book, chapter, version, key]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  if (!target) return { data: null, loading: false, error: "", retryable: false, retry };
  if (result?.key !== key) return { data: null, loading: true, error: "", retryable: false, retry };
  return { ...result, loading: false, retry };
}

export function useChapterReader() {
  const [session, setSession] = useState(0);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [comparisonVersion, setComparisonVersion] = useState("");
  const [expanded, setExpanded] = useState(false);
  const chapter = useChapter(selection?.result ?? null, session);
  const comparison = useChapter(selection && comparisonVersion ? { ...selection.result, version: comparisonVersion } : null, session);

  const open = useCallback((next: ReaderSelection) => {
    setSession(value => value + 1);
    setSelection(next);
    setComparisonVersion("");
    setExpanded(false);
  }, []);
  const close = useCallback(() => setSelection(null), []);
  return { selection, chapter, comparison, comparisonVersion, expanded, open, close, setComparisonVersion, setExpanded };
}
