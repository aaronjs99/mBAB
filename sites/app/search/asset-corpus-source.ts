import { parseBundledCorpus, readBundledChapter, searchBundledCorpus, type BundledCorpus } from "./bundled-corpus";
import type { CorpusSource } from "./search-handler";

export type AssetBinding = { fetch(request: Request): Promise<Response> };
const ZERO = BigInt(0);
const ONE = BigInt(1);

export function createAssetCorpusSource(assets: AssetBinding): CorpusSource {
  // Retain one edition so comparisons cannot cache every Bible in an isolate.
  let cached: { version: string; data: Promise<BundledCorpus> } | undefined;
  let vocabulary: { version: string; words: Map<string, bigint> } | undefined;
  async function load(version: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (cached?.version !== version) {
      const data = assets.fetch(new Request(`https://mbab.local/corpus/${version}.json`))
        .then(async response => {
          if (!response.ok) throw new Error("The bundled edition is missing.");
          return parseBundledCorpus(await response.json(), version);
        });
      cached = { version, data };
      void data.catch(() => { if (cached?.data === data) cached = undefined; });
    }
    const corpus = await cached.data;
    signal.throwIfAborted();
    return corpus;
  }
  return {
    async vocabulary(version, books, signal) {
      const corpus = await load(version, signal);
      if (vocabulary?.version !== version) {
        const words = new Map<string, bigint>();
        for (const [bookId, , , text] of corpus.rows) {
          const book = ONE << BigInt(bookId);
          for (const word of text.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
            if (/^[a-z]+$/.test(word)) words.set(word, (words.get(word) ?? ZERO) | book);
          }
        }
        vocabulary = { version, words };
      }
      signal.throwIfAborted();
      const scope = books.reduce((mask, book) => mask | (ONE << BigInt(book)), ZERO);
      return new Set([...vocabulary.words].filter(([, mask]) => (mask & scope) !== ZERO).map(([word]) => word));
    },
    async search(expression, version, books, caseSensitive, signal) {
      return searchBundledCorpus(await load(version, signal), expression, { bookIds: books, caseSensitive });
    },
    async chapter(reference, version, signal) {
      return readBundledChapter(await load(version, signal), reference.bookId, reference.chapter)
        .map(verse => ({ verse: verse.verse, text: verse.text }));
    },
  };
}
