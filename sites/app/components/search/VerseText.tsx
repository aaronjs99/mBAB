import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { HighlightedText } from "./HighlightedText";
import { WordMeaning } from "./WordMeaning";

type Selection = { word: string; index: number; anchor: HTMLButtonElement; text: string };

export function VerseText({ text, query = "", caseSensitive = false }: { text: string; query?: string; caseSensitive?: boolean }) {
  const container = useRef<HTMLSpanElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<Selection | null>(null);
  const parts = text.split(/(\p{L}[\p{L}\p{M}]*(?:['’‐‑-][\p{L}\p{M}]+)*)/u);
  const wordCount = (parts.length - 1) / 2;
  const active = Math.min(activeIndex, wordCount - 1);
  const selection = selected?.text === text ? selected : null;

  const close = useCallback((restoreFocus: boolean) => {
    setSelected(null);
    if (restoreFocus && selected?.anchor.isConnected) selected.anchor.focus({ preventScroll: true });
  }, [selected]);

  useEffect(() => {
    if (!selection) return;
    const closeOther = (event: Event) => {
      if ((event as CustomEvent).detail !== selection.anchor) setSelected(null);
    };
    document.addEventListener("mbab:word-meaning", closeOther);
    return () => document.removeEventListener("mbab:word-meaning", closeOther);
  }, [selection]);

  return <span className="verse-words" ref={container} role="group" aria-label="Verse text. Use arrow keys to choose a word, then Enter to see its meaning.">
    {parts.map((part, index) => {
      if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
      const wordIndex = (index - 1) / 2;
      return <button key={index} className="verse-word" type="button" tabIndex={wordIndex === active ? 0 : -1}
        aria-label={`Look up ${part}`} aria-haspopup="dialog" aria-expanded={selection?.index === wordIndex}
        onFocus={() => setActiveIndex(wordIndex)}
        onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (wordIndex + 1) % wordCount
            : event.key === "ArrowLeft" ? (wordIndex + wordCount - 1) % wordCount
            : event.key === "Home" ? 0 : event.key === "End" ? wordCount - 1 : null;
          if (next === null) return;
          event.preventDefault();
          container.current?.querySelectorAll<HTMLButtonElement>(".verse-word")[next]?.focus();
        }}
        onClick={event => {
          const selectedText = window.getSelection();
          if (event.detail > 0 && selectedText && !selectedText.isCollapsed) return;
          const anchor = event.currentTarget;
          if (selection?.anchor === anchor) { close(false); return; }
          document.dispatchEvent(new CustomEvent("mbab:word-meaning", { detail: anchor }));
          setActiveIndex(wordIndex);
          setSelected({ word: part, index: wordIndex, anchor, text });
        }}><HighlightedText text={part} query={query} caseSensitive={caseSensitive} /></button>;
    })}
    {selection && <WordMeaning key={`${selection.index}:${selection.word}`} word={selection.word} anchor={selection.anchor} onClose={close} />}
  </span>;
}
