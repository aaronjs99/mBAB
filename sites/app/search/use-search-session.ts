"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { expressionFor } from "./query";
import { isSearchResponse } from "./search-response";
import { DEFAULT_SEARCH, readSearchLocation, sameSearchSettings, searchParamsFor } from "./search-location";
import type { SearchLocation, SearchResponse } from "./types";

type CompletedSearch = { settings: SearchLocation; response: SearchResponse };
type SearchFailure = { settings: SearchLocation; message: string; retryable: boolean };

export function useSearchSession() {
  const [draft, setDraft] = useState(DEFAULT_SEARCH);
  const [completed, setCompleted] = useState<CompletedSearch | null>(null);
  const [pending, setPending] = useState<SearchLocation | null>(null);
  const [failure, setFailure] = useState<SearchFailure | null>(null);
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (settings: SearchLocation, navigation: "push" | "restore" = "push") => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setPending(null);
    setFailure(null);
    setStatus("");

    const built = expressionFor(settings.query, settings.mode);
    const validationError = settings.query.length < 2
      ? "Enter at least two characters to begin."
      : !settings.bookIds.length ? "Choose at least one book." : built.error;
    if (validationError) {
      setFailure({ settings, message: validationError, retryable: false });
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(settings);
    const params = searchParamsFor(settings);
    params.set("pageSize", "20");
    try {
      const result = await fetch(`/api/search?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      const payload: unknown = await result.json().catch(() => null);
      if (!result.ok) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error : "Search could not be completed.";
        throw new Error(message);
      }
      if (!isSearchResponse(payload)) {
        throw new Error("Search returned an unreadable response. Please try again.");
      }
      if (activeRequest.current !== controller || controller.signal.aborted) return;

      const shownSettings = { ...settings, page: payload.page };
      setCompleted({ settings: shownSettings, response: payload });
      const nextUrl = `${window.location.pathname}?${searchParamsFor(shownSettings)}`;
      if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
        if (navigation === "push") window.history.pushState(null, "", nextUrl);
        else window.history.replaceState(null, "", nextUrl);
      }
      requestAnimationFrame(() => {
        document.getElementById("search-results")?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start",
        });
      });
    } catch (error) {
      if (activeRequest.current !== controller || controller.signal.aborted) return;
      const message = error instanceof DOMException && error.name === "TimeoutError"
        ? "Search took too long. Please try again."
        : error instanceof TypeError
          ? "Could not connect to search. Check your connection and try again."
          : error instanceof Error ? error.message : "Search could not be completed.";
      setFailure({ settings, message, retryable: true });
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setPending(null);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setPending(null);
    setFailure(null);
    setStatus("Search cancelled.");
  }, []);

  useEffect(() => {
    let disposed = false;
    const restoreLocation = () => {
      const restored = readSearchLocation(window.location.search);
      setDraft(restored);
      if (restored.query) void runSearch(restored, "restore");
      else {
        activeRequest.current?.abort();
        activeRequest.current = null;
        setPending(null);
        setCompleted(null);
        setFailure(null);
        setStatus("");
      }
    };
    queueMicrotask(() => {
      if (disposed) return;
      restoreLocation();
      setReady(true);
    });
    window.addEventListener("popstate", restoreLocation);
    return () => {
      disposed = true;
      window.removeEventListener("popstate", restoreLocation);
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [runSearch]);

  return {
    draft, setDraft, completed, pending, failure, status, ready, runSearch, cancel,
    draftChanged: !!completed && !sameSearchSettings(draft, completed.settings),
  };
}
