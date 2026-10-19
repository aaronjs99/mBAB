import provenance from "./data/dictionary/provenance.json";

export type DictionaryPart = "noun" | "verb" | "adjective" | "adverb";
export type DictionarySense = { pos: DictionaryPart; definition: string; examples: string[]; synonyms: string[] };
export type DictionaryEntry = { word: string; forms?: string[]; alternatives?: string[]; senses: DictionarySense[]; suggestions?: string[] };
type FileInfo = { file?: string; sha256: string; bytes: number };
type Manifest = { schema: 1; letters: Record<string, FileInfo>; exceptions: Record<DictionaryPart, Record<string, string[]>> };
type Shard = { schema: 1; letter: string; entries: Record<string, DictionarySense[]> };
const parts: DictionaryPart[] = ["noun", "verb", "adjective", "adverb"];
let manifestCache: Manifest | undefined;
const shards = new Map<string, Shard>();
const failedFiles = new Set<string>();
const own = <T>(table: Record<string, T>, key: string): T | undefined => Object.hasOwn(table, key) ? table[key] : undefined;

export function clearDictionaryCache() { manifestCache = undefined; shards.clear(); failedFiles.clear(); }

export function normalizeDictionaryWord(input: string): string {
  return input.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑–—]/g, "-")
    .replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

async function readAsset(file: string, info: FileInfo, signal: AbortSignal) {
  const response = await fetch(`/dictionary/${file}?v=${info.sha256}`, { signal, cache: failedFiles.has(file) ? "reload" : "force-cache" });
  if (!response.ok) { failedFiles.add(file); throw new Error("The dictionary could not load. Please try again."); }
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== info.bytes || digest !== info.sha256) { failedFiles.add(file); throw new Error("The dictionary download is incomplete. Please try again."); }
  failedFiles.delete(file);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function manifest(signal: AbortSignal): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  const value = await readAsset("manifest.json", provenance.files["manifest.json"], signal) as Manifest;
  if (value?.schema !== 1 || !value.letters || !value.exceptions || parts.some(part => !value.exceptions[part])) {
    throw new Error("The dictionary index is unreadable. Please try again.");
  }
  for (const [letter, file] of Object.entries(value.letters)) {
    if (!/^(?:[a-z]|other)$/.test(letter) || file.file !== `${letter}.json`
      || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 25 * 1024 * 1024) {
      throw new Error("The dictionary index contains an invalid file.");
    }
  }
  signal.throwIfAborted();
  manifestCache = value;
  return value;
}

async function loadShard(word: string, index: Manifest, signal: AbortSignal): Promise<Shard> {
  const letter = /^[a-z]/.test(word) ? word[0] : "other";
  const cached = shards.get(letter);
  if (cached) { shards.delete(letter); shards.set(letter, cached); return cached; }
  const file = own(index.letters, letter);
  if (!file) throw new Error("This part of the dictionary is unavailable.");
  const value = await readAsset(`${letter}.json`, file, signal) as Shard;
  if (value?.schema !== 1 || value.letter !== letter || !value.entries || typeof value.entries !== "object") {
    throw new Error("The dictionary entries are unreadable.");
  }
  for (const senses of Object.values(value.entries)) {
    if (!Array.isArray(senses) || !senses.length || senses.some(sense => !parts.includes(sense.pos)
      || typeof sense.definition !== "string" || !sense.definition || !Array.isArray(sense.examples)
      || sense.examples.some(example => typeof example !== "string") || !Array.isArray(sense.synonyms)
      || sense.synonyms.some(synonym => typeof synonym !== "string"))) throw new Error("The dictionary contains unreadable meanings.");
  }
  signal.throwIfAborted();
  shards.set(letter, value);
  while (shards.size > 3) shards.delete(shards.keys().next().value!);
  return value;
}

function inflections(word: string, index: Manifest): Array<{ word: string; pos: DictionaryPart }> {
  const rules: Partial<Record<DictionaryPart, Array<[string, string]>>> = {
    noun: [["s", ""], ["ses", "s"], ["xes", "x"], ["zes", "z"], ["ches", "ch"], ["shes", "sh"], ["men", "man"], ["ies", "y"]],
    verb: [["s", ""], ["ies", "y"], ["es", "e"], ["es", ""], ["ed", "e"], ["ed", ""], ["ing", "e"], ["ing", ""], ["eth", ""], ["eth", "e"], ["est", ""], ["est", "e"]],
    adjective: [["er", ""], ["est", ""], ["er", "e"], ["est", "e"]],
  };
  const candidates: Array<{ word: string; pos: DictionaryPart }> = [];
  for (const pos of parts) {
    for (const base of own(index.exceptions[pos], word) ?? []) candidates.push({ word: base, pos });
  }
  const archaicBase = own({ hath: "have", doth: "do", saith: "say" }, word);
  if (archaicBase) candidates.push({ word: archaicBase, pos: "verb" });
  for (const pos of parts) {
    for (const [suffix, ending] of rules[pos] ?? []) {
      if (!word.endsWith(suffix) || word.length <= suffix.length + 1) continue;
      const base = word.slice(0, -suffix.length) + ending;
      candidates.push({ word: base, pos });
      if (pos === "verb" && !ending && (suffix === "eth" || suffix === "est") && /([b-df-hj-np-tv-z])\1$/.test(base)) {
        candidates.push({ word: base.slice(0, -1), pos });
      }
    }
  }
  return candidates.filter((item, i) => candidates.findIndex(other => other.word === item.word && other.pos === item.pos) === i);
}

function spellingSuggestions(word: string, entries: Shard["entries"]): string[] {
  if (word.length < 3 || word.length > 24) return [];
  const candidates: Array<{ word: string; distance: number }> = [];
  for (const candidate of Object.keys(entries)) {
    if (candidate[0] !== word[0] || Math.abs(candidate.length - word.length) > 2) continue;
    let previous = Array.from({ length: word.length + 1 }, (_, i) => i);
    for (let i = 0; i < candidate.length; i++) {
      const next = [i + 1];
      for (let j = 0; j < word.length; j++) next.push(Math.min(next[j] + 1, previous[j + 1] + 1, previous[j] + Number(candidate[i] !== word[j])));
      previous = next;
    }
    const distance = previous[word.length];
    if (distance <= (word.length < 5 ? 1 : 2)) candidates.push({ word: candidate, distance });
  }
  return candidates.sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word)).slice(0, 3).map(item => item.word);
}

export async function lookupDictionary(input: string, requestSignal: AbortSignal): Promise<DictionaryEntry> {
  requestSignal.throwIfAborted();
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(30_000)]);
  const word = normalizeDictionaryWord(input);
  if (!word || word.length > 80 || !/[a-z0-9]/.test(word) || /[^\x20-\x7e]/.test(word)) {
    return { word, senses: [], suggestions: [] };
  }
  const index = await manifest(signal);
  const shard = await loadShard(word, index, signal);
  const exact = own(shard.entries, word);
  const matches: Array<{ word: string; senses: DictionarySense[] }> = exact ? [{ word, senses: [...exact] }] : [];
  for (const candidate of inflections(word, index)) {
    if (candidate.word === word) continue;
    const data = await loadShard(candidate.word, index, signal);
    const senses = own(data.entries, candidate.word)?.filter(sense => sense.pos === candidate.pos);
    if (senses?.length) {
      const existing = matches.find(match => match.word === candidate.word);
      if (existing) existing.senses.push(...senses.filter(sense => !existing.senses.includes(sense)));
      else matches.push({ word: candidate.word, senses: [...senses] });
    }
  }
  signal.throwIfAborted();
  if (matches.length) return { ...matches[0], forms: matches[0].word === word ? undefined : [word], alternatives: matches.slice(1).map(match => match.word) };
  return { word, senses: [], suggestions: spellingSuggestions(word, shard.entries) };
}
