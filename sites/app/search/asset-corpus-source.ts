import { parseBundledCorpus, readBundledChapter, searchBundledCorpus, type BundledCorpus } from "./bundled-corpus";
import type { CorpusSource } from "./search-handler";

export type AssetBinding = { fetch(request: Request): Promise<Response> };

export function createAssetCorpusSource(assets: AssetBinding): CorpusSource {
  // Retain one edition so comparisons cannot cache every Bible in an isolate.
  let cached: { version: string; data: Promise<BundledCorpus> } | undefined;
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
    async search(expression, version, books, caseSensitive, signal) {
      return searchBundledCorpus(await load(version, signal), expression, { bookIds: books, caseSensitive });
    },
    async chapter(reference, version, signal) {
      return readBundledChapter(await load(version, signal), reference.bookId, reference.chapter)
        .map(verse => ({ verse: verse.verse, text: verse.text }));
    },
  };
}
