import lexicalData from "./data/wordnet-related.json";
import { expressionFor, parseReference } from "./query";
import type { SearchExample, SearchMode } from "./types";

type Lexicon = { entries: Record<string, string[]>; exceptions: Record<string, string[]>;
  derivations: Record<string, string[]>; parts: Record<string, number>; vocabulary: string[] };
const lexicon = lexicalData as unknown as Lexicon;
const bibleWords = new Set(lexicon.vocabulary);
const stopWords = new Set("a an and are as at be been being but by did do does for from had has have he her hers him his i if in into is it its me my no nor not of on or our ours she so than that the their theirs them then there these they this those thou thy to too unto us was we were what when where which who whom why will with ye you your yours".split(" "));
const reverseExceptions = new Map<string, string[]>();
for (const [form, bases] of Object.entries(lexicon.exceptions)) {
  for (const base of bases) reverseExceptions.set(base, [...(reverseExceptions.get(base) ?? []), form]);
}

function lookup<T>(table: Record<string, T>, word: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, word) ? table[word] : undefined;
}

function supportsDerivation(form: string, base: string): boolean {
  if (lookup(lexicon.derivations, form)?.includes(base)) return true;
  const formParts = lookup(lexicon.parts, form) ?? 0;
  const baseParts = lookup(lexicon.parts, base) ?? 0;
  // WordNet POS flags: noun=1, verb=2, adjective=4, adverb=8.
  // Require both lemmas and the affix's grammatical roles, not just spelling.
  if (form.endsWith("ness")) return !!((formParts & 1) && (baseParts & 6));
  if (form.endsWith("dom")) return !!((formParts & 1) && (baseParts & 5));
  if (form.endsWith("ful") || form.endsWith("less")) return !!((formParts & 4) && (baseParts & 3));
  if (form.endsWith("able") || form.endsWith("ible")) return !!((formParts & 4) && (baseParts & 2));
  if (form.endsWith("ly")) return !!((formParts & 8) && (baseParts & 4));
  return false;
}

function basesFor(word: string, vocabulary: ReadonlySet<string>, includeDerivations = true): string[] {
  const exceptions = lookup(lexicon.exceptions, word) ?? [];
  const bases = [word, ...exceptions];
  // A plausible suffix also needs dictionary support: random is not ran + dom.
  const derivations = [["iness", "y"], ["ness", ""], ["ness", "e"], ["iful", "y"],
    ["ful", ""], ["ful", "e"], ["less", ""], ["less", "e"], ["dom", ""], ["dom", "e"],
    ["able", ""], ["able", "e"], ["ible", ""], ["ible", "e"],
    ["ly", ""], ["ly", "e"], ["ily", "y"]];
  // Known lemmas (king, honest, news) must not be mistaken for inflections.
  const inflections = lookup(lexicon.parts, word) ? [] : [["ies", "y"], ["men", "man"], ["ches", "ch"], ["shes", "sh"],
    ["sses", "ss"], ["xes", "x"], ["zes", "z"], ["s", ""], ["ied", "y"],
    ["ed", ""], ["ed", "e"], ["ing", ""], ["ing", "e"],
    ["er", ""], ["er", "e"], ["est", ""], ["est", "e"], ["eth", ""], ["eth", "e"]];
  const rules = [...(includeDerivations ? derivations.map(([ending, replacement]) => [ending, replacement, true] as const) : []),
    ...inflections.map(([ending, replacement]) => [ending, replacement, false] as const)];
  for (const [ending, replacement, derivation] of rules) {
    if (!word.endsWith(ending)) continue;
    const base = word.slice(0, -ending.length) + replacement;
    if (base.length >= 2 && (!derivation || supportsDerivation(word, base))
      && (lookup(lexicon.entries, base) || vocabulary.has(base))) bases.push(base);
    if (!replacement && /([b-df-hj-np-tv-z])\1$/.test(base)) {
      const single = base.slice(0, -1);
      if ((!derivation || supportsDerivation(word, single)) && (lookup(lexicon.entries, single) || vocabulary.has(single))) bases.push(single);
    }
  }
  return [...new Set(bases)];
}

function formsFor(base: string): string[] {
  const forms = [base, ...(reverseExceptions.get(base) ?? []), `${base}s`, `${base}ed`, `${base}ing`,
    `${base}er`, `${base}est`, `${base}eth`];
  const derived = ["ly", "ness", "ful", "less", "dom", "able", "ible"].map(end => base + end);
  if (base.endsWith("e")) {
    forms.push(`${base}d`, `${base.slice(0, -1)}ing`, `${base}r`, `${base}st`, `${base}th`);
    derived.push(...["dom", "able", "ible"].map(end => base.slice(0, -1) + end));
  }
  if (/[^aeiou]y$/.test(base)) {
    forms.push(...["ies", "ied", "ier", "iest"].map(end => base.slice(0, -1) + end));
    derived.push(...["ily", "iness", "iful"].map(end => base.slice(0, -1) + end));
  }
  forms.push(...derived.filter(word => supportsDerivation(word, base)));
  if (/[sxz]$|[cs]h$/.test(base)) forms.push(`${base}es`);
  if (/[^aeiouwxy][aeiou][^aeiouwxy]$/.test(base)) {
    forms.push(...["ed", "ing", "er", "est"].map(end => base + base.at(-1) + end));
  }
  return [...new Set(forms)];
}

function candidatesFor(word: string, vocabulary: ReadonlySet<string>): string[] {
  const bases = basesFor(word, vocabulary);
  const groups = bases.map(formsFor);
  // Do not chain dictionary senses through derived words: wisdom -> wise does
  // not license wise's unrelated slang senses as suggestions for wisdom.
  for (const base of basesFor(word, vocabulary, false)) {
    for (const related of lookup(lexicon.entries, base) ?? []) groups.push(formsFor(related));
  }
  const filtered = groups.map(group => group.filter(term => term !== word && !stopWords.has(term)
    && /^[a-z]+$/.test(term) && vocabulary.has(term)));
  const candidates = new Set<string>();
  // Interleave families so inflections cannot hide all distinct dictionary words.
  for (let index = 0; index < 12 && candidates.size < 24; index++) {
    for (const group of filtered) {
      if (group[index]) candidates.add(group[index]);
      if (candidates.size === 24) break;
    }
  }
  return [...candidates];
}

function matchCase(word: string, replacement: string, caseSensitive: boolean) {
  if (!caseSensitive) return replacement;
  if (word === word.toUpperCase()) return replacement.toUpperCase();
  if (/^[A-Z][a-z]+$/.test(word)) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function buildRelatedSuggestions(
  query: string, mode: SearchMode, caseSensitive: boolean,
  vocabulary: ReadonlySet<string> = bibleWords,
): SearchExample[] {
  if (parseReference(query)) return [];
  const expression = expressionFor(query, mode).expression;
  if (!expression) return [];
  const operands = expression.match(/[A-Za-z0-9_]+/g) ?? [];
  const groups = operands.map((original, operandIndex) => {
    const word = original.toLowerCase();
    if (!/^[a-z]+$/.test(word) || stopWords.has(word)) return [];
    return candidatesFor(word, vocabulary).flatMap(candidate => {
      const replacement = matchCase(original, candidate, caseSensitive);
      let index = -1;
      const rewritten = expression.replace(/[A-Za-z0-9_]+/g, token => ++index === operandIndex ? replacement : token);
      const nextQuery = mode === "advanced" ? rewritten : rewritten.replace(/[+,]/g, " ");
      if (nextQuery.length > 120 || nextQuery.length < 2) return [];
      return [{ query: nextQuery, mode, label: operands.length === 1 ? replacement : `${original} → ${replacement}` }];
    });
  });
  const result: SearchExample[] = [];
  const seen = new Set<string>();
  let expressionBudget = 0;
  for (let index = 0; index < 24 && result.length < 24; index++) {
    for (const group of groups) {
      const suggestion = group[index];
      if (!suggestion || seen.has(suggestion.query)) continue;
      const size = expressionFor(suggestion.query, suggestion.mode).expression!.length + 3;
      if (expressionBudget + size > 1800) continue;
      seen.add(suggestion.query);
      result.push(suggestion);
      expressionBudget += size;
      if (result.length === 24) break;
    }
  }
  return result;
}
