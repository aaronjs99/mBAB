import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lookupDictionary, type DictionaryEntry } from "@/app/search/dictionary";

type Props = { word: string; anchor: HTMLButtonElement; onClose: (restoreFocus: boolean) => void };
type Position = { left: number; top: number };

export function WordMeaning({ word, anchor, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [lookupWord, setLookupWord] = useState(word);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const owner = anchor.ownerDocument;

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setEntry(null);
    setExpanded(false);
    try {
      const result = await lookupDictionary(lookupWord, controller.signal);
      if (!controller.signal.aborted) setEntry(result);
    } catch {
      if (!controller.signal.aborted) setError("Couldn’t load the dictionary. Please try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [lookupWord]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; requestRef.current?.abort(); };
  }, [load]);

  const reposition = useCallback(() => {
    const popup = popupRef.current;
    const viewport = anchor.ownerDocument.defaultView;
    if (!popup || !viewport) return;
    const bounds = anchor.getBoundingClientRect();
    const width = popup.getBoundingClientRect().width;
    const height = popup.getBoundingClientRect().height;
    const left = Math.max(12, Math.min(bounds.left, viewport.innerWidth - width - 12));
    const below = viewport.innerHeight - bounds.bottom - 20;
    const above = bounds.top - 20;
    const preferred = height > below && above > below ? bounds.top - height - 8 : bounds.bottom + 8;
    const top = Math.max(12, Math.min(preferred, viewport.innerHeight - height - 12));
    setPosition(current => current?.left === left && current.top === top ? current : { left, top });
  }, [anchor]);

  useLayoutEffect(() => {
    const popup = popupRef.current!;
    reposition();
    popup.focus({ preventScroll: true });
    const observer = new ResizeObserver(reposition);
    observer.observe(popup);
    return () => observer.disconnect();
  }, [reposition]);

  useEffect(() => {
    const isInside = (target: EventTarget | null) => target instanceof Node && (popupRef.current?.contains(target) || anchor.contains(target));
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    };
    const outside = (event: PointerEvent | FocusEvent) => { if (!isInside(event.target)) onClose(false); };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      const bounds = anchor.getBoundingClientRect();
      const viewport = owner.defaultView;
      const clip = anchor.closest(".reader-body")?.getBoundingClientRect();
      if (!anchor.isConnected || !viewport || bounds.bottom <= Math.max(0, clip?.top ?? 0)
        || bounds.top >= Math.min(viewport.innerHeight, clip?.bottom ?? viewport.innerHeight)) onClose(false);
      else reposition();
    };
    const resize = () => onClose(false);
    owner.addEventListener("keydown", escape, true);
    owner.addEventListener("pointerdown", outside, true);
    owner.addEventListener("focusin", outside);
    owner.addEventListener("scroll", scroll, true);
    owner.defaultView?.addEventListener("resize", resize);
    return () => {
      owner.removeEventListener("keydown", escape, true);
      owner.removeEventListener("pointerdown", outside, true);
      owner.removeEventListener("focusin", outside);
      owner.removeEventListener("scroll", scroll, true);
      owner.defaultView?.removeEventListener("resize", resize);
    };
  }, [anchor, onClose, owner, reposition]);

  return createPortal(
    <div className="word-meaning" role="dialog" aria-label={`Meaning of ${word}`} tabIndex={-1} ref={popupRef}
      style={{ left: position?.left ?? 12, top: position?.top ?? 12 }}>
      <div className="word-meaning-head">
        <h3>{entry?.word ?? lookupWord}</h3>
        <button className="word-meaning-close" type="button" aria-label="Close meaning" onClick={() => onClose(true)}><span aria-hidden="true">×</span></button>
      </div>
      <div aria-busy={loading}>
        {loading && <p className="word-meaning-message" role="status"><span className="spinner" aria-hidden="true" /> Looking up…</p>}
        {error && <div className="word-meaning-message" role="alert"><p>{error}</p><button className="word-meaning-link" type="button" onClick={() => { popupRef.current?.focus({ preventScroll: true }); void load(); }}>Try again</button></div>}
        {!loading && !error && entry && !entry.senses.length && <p className="word-meaning-message" role="status">No entry for “{lookupWord}”.</p>}
        {!loading && !error && entry && entry.senses.length > 0 && <>
          {!!entry.forms?.length && <p className="word-meaning-form">Base form of “{entry.forms[0]}”.</p>}
          <ol className="word-meaning-list">
            {(expanded ? entry.senses : entry.senses.slice(0, 3)).map((sense, index) => <li key={`${sense.pos}-${index}`}>
              <span className="word-part">{sense.pos}</span>
              <p className="word-definition">{sense.definition}</p>
              {(expanded ? sense.examples : sense.examples.slice(0, 1)).map((example, i) => <p className="word-example" key={i}>“{example}”</p>)}
            </li>)}
          </ol>
          {entry.senses.length > 3 && <button className="word-meaning-link" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer meanings" : "Show all meanings"}</button>}
        </>}
        {!loading && !error && !!(entry?.alternatives?.length || entry?.suggestions?.length) && <div className="word-meaning-alternatives"><span>{entry?.senses.length ? "Other forms" : "Try"}</span>{(entry?.alternatives?.length ? entry.alternatives : entry?.suggestions ?? []).map(term => <button className="word-meaning-link" type="button" key={term} onClick={() => { popupRef.current?.focus({ preventScroll: true }); setLookupWord(term); }}>{term}</button>)}</div>}
      </div>
      <div className="word-meaning-credit"><a href="https://wordnet.princeton.edu/" target="_blank" rel="noreferrer">WordNet</a><span aria-hidden="true">·</span><a href="/WORDNET-LICENSE.txt" target="_blank" rel="noreferrer">License</a></div>
    </div>,
    anchor.closest("dialog") ?? owner.body,
  );
}
