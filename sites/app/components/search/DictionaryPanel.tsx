import { useCallback, useEffect, useRef, useState } from "react";
import { lookupDictionary } from "@/app/search/dictionary";

type Props = {
  initialWord?: string;
  onClose: () => void;
  onSearchWord?: (word: string) => void;
};

type Entry = Awaited<ReturnType<typeof lookupDictionary>>;

const PARTS_OF_SPEECH = ["noun", "verb", "adjective", "adverb"] as const;
const WORD_PATTERN = /^[\p{L}\p{N}\p{P}\p{Zs}]+$/u;

function initialLookup(value: string) {
  const word = value.trim();
  return word.length <= 80 && WORD_PATTERN.test(word) ? word : "";
}

export function DictionaryPanel({ initialWord = "", onClose, onSearchWord }: Props) {
  const startingWord = useRef(initialLookup(initialWord));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const [input, setInput] = useState(() => initialLookup(initialWord));
  const [lookedUp, setLookedUp] = useState("");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(false);

  const lookUp = useCallback(async (value: string) => {
    const word = value.trim();
    requestRef.current?.abort();
    const currentRequest = ++requestNumber.current;
    if (!word || word.length > 80 || !WORD_PATTERN.test(word)) {
      setLoading(false);
      setRetryable(false);
      setError("Enter a word or a short phrase.");
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setInput(word);
    setLookedUp(word);
    setEntry(null);
    setError("");
    setRetryable(false);
    setLoading(true);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    try {
      const result = await lookupDictionary(word, controller.signal);
      if (controller.signal.aborted || currentRequest !== requestNumber.current) return;
      setEntry(result);
    } catch {
      if (controller.signal.aborted || currentRequest !== requestNumber.current) return;
      setError("Couldn’t load the dictionary. Please try again.");
      setRetryable(true);
    } finally {
      if (!controller.signal.aborted && currentRequest === requestNumber.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
    if (startingWord.current) void lookUp(startingWord.current);
    return () => {
      requestRef.current?.abort();
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [lookUp]);

  return (
    <dialog
      className="dictionary-panel" ref={dialogRef} aria-labelledby="dictionary-heading"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <header className="dictionary-header">
        <h2 id="dictionary-heading">Dictionary</h2>
        <button className="dictionary-close" type="button" onClick={onClose} aria-label="Close dictionary"><span aria-hidden="true">×</span></button>
      </header>
      <form className="dictionary-form" onSubmit={event => { event.preventDefault(); void lookUp(input); }}>
        <label className="sr-only" htmlFor="dictionary-word">Dictionary word</label>
        <input id="dictionary-word" ref={inputRef} value={input} maxLength={80} placeholder="Look up a word" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" onChange={event => setInput(event.target.value)} />
        <button type="submit">Look up</button>
      </form>
      <div className="dictionary-body" ref={bodyRef} aria-busy={loading}>
        {loading && <p className="dictionary-message" role="status"><span className="spinner" aria-hidden="true" /> Looking up “{lookedUp}”…</p>}
        {error && <div className="dictionary-message dictionary-error" role="alert"><p>{error}</p>{retryable && <button type="button" onClick={() => void lookUp(lookedUp)}>Try again</button>}</div>}
        {!loading && !error && !entry && <p className="dictionary-message">Word meanings, with examples.</p>}
        {!loading && !error && entry && entry.senses.length === 0 && (
          <div className="dictionary-empty" role="status">
            <h3>No entry for “{lookedUp}”</h3>
            <p>Try another spelling or a base word.</p>
            {!!entry.suggestions?.length && <div className="dictionary-suggestions"><span>Did you mean</span>{entry.suggestions.map(word => <button type="button" key={word} onClick={() => void lookUp(word)}>{word}</button>)}</div>}
          </div>
        )}
        {!loading && !error && entry && entry.senses.length > 0 && (
          <article className="dictionary-entry" aria-label={`Meanings of ${entry.word}`}>
            <p className="sr-only" role="status">{entry.word}: {entry.senses.length} {entry.senses.length === 1 ? "definition" : "definitions"}.</p>
            <div className="dictionary-entry-head">
              <h3>{entry.word}</h3>
              {onSearchWord && <button className="dictionary-find" type="button" onClick={() => { onClose(); onSearchWord(entry.word); }}>Find verses <span aria-hidden="true">↗</span></button>}
            </div>
            {!!entry.forms?.length && <p className="dictionary-form-note">Base form of “{entry.forms[0]}”.</p>}
            {!!entry.alternatives?.length && <div className="dictionary-suggestions"><span>Other forms</span>{entry.alternatives.map(word => <button type="button" key={word} onClick={() => void lookUp(word)}>{word}</button>)}</div>}
            {PARTS_OF_SPEECH.map(pos => {
              const senses = entry.senses.filter(sense => sense.pos === pos);
              if (!senses.length) return null;
              return (
                <section className="dictionary-part" key={pos} aria-labelledby={`dictionary-${pos}`}>
                  <h4 id={`dictionary-${pos}`}>{pos}</h4>
                  <ol>
                    {senses.map((sense, index) => (
                      <li key={`${pos}-${index}`}>
                        <p className="dictionary-definition">{sense.definition}</p>
                        {sense.examples.map((example, exampleIndex) => <p className="dictionary-example" key={`${index}-${exampleIndex}`}>“{example}”</p>)}
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </article>
        )}
      </div>
      <div className="dictionary-credit"><span>Source: <a href="https://wordnet.princeton.edu/" target="_blank" rel="noreferrer">WordNet</a></span><span aria-hidden="true">·</span><a href="/WORDNET-LICENSE.txt" target="_blank" rel="noreferrer">License</a></div>
    </dialog>
  );
}
