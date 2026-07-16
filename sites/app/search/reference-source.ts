import type { BibleReference } from "./query";

type ChapterVerse = { verse: number; text: string };

const PYTHONANYWHERE_CHAPTER_URL = "https://aaronjs.pythonanywhere.com/chapter/";
const HELLOAO_BASE_URL = "https://bible.helloao.org/api";
const BIBLE_DATABASES_CSV_URL = "https://raw.githubusercontent.com/aaronjs99/bible-databases/master/CSV";

const HELLOAO_VERSION_BY_MBAB: Record<string, string> = {
  ASV: "eng_asv",
  BBE: "eng_bbe",
  BSB: "BSB",
  DBY: "eng_dby",
  GEN: "eng_gnv",
  KJV: "eng_kjv",
  WBT: "eng_wbs",
  WEB: "ENGWEBP",
  YLT: "eng_ylt",
};

const HELLOAO_BOOK_IDS = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentText).join("");
  if (value && typeof value === "object") {
    const item = value as { text?: unknown; content?: unknown };
    return contentText(item.text ?? item.content ?? "");
  }
  return "";
}

async function fromPythonAnywhere(
  reference: BibleReference,
  version: string,
): Promise<ChapterVerse[] | null> {
  const url = new URL(PYTHONANYWHERE_CHAPTER_URL);
  url.searchParams.set("book", reference.book);
  url.searchParams.set("chapter", String(reference.chapter));
  url.searchParams.set("version", version);
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "mBAB-Sites/1.0" },
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { verses?: ChapterVerse[] };
  return payload.verses ?? null;
}

async function fromHelloAo(
  reference: BibleReference,
  version: string,
): Promise<ChapterVerse[] | null> {
  const translation = HELLOAO_VERSION_BY_MBAB[version];
  const book = HELLOAO_BOOK_IDS[reference.bookId];
  if (!translation || !book) return null;
  const response = await fetch(
    `${HELLOAO_BASE_URL}/${translation}/${book}/${reference.chapter}.json`,
    {
      headers: { Accept: "application/json", "User-Agent": "mBAB-Sites/1.0" },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    chapter?: { content?: Array<{ type?: string; number?: number; content?: unknown }> };
  };
  return (payload.chapter?.content ?? [])
    .filter((item) => item.type === "verse" && Number.isInteger(item.number))
    .map((item) => ({
      verse: Number(item.number),
      text: contentText(item.content).replace(/^¶\s*/, ""),
    }));
}

function decodeCsvText(value: string): string {
  const trimmed = value.trimEnd();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replace(/""/g, '"')
    : trimmed;
}

async function fromBibleDatabases(
  reference: BibleReference,
  version: string,
): Promise<ChapterVerse[] | null> {
  if (!(version === "AKJV" || version === "UKJV")) return null;
  const response = await fetch(
    `${BIBLE_DATABASES_CSV_URL}/${version}Bible_Database.csv`,
    {
      headers: { Accept: "text/csv", "User-Agent": "mBAB-Sites/1.0" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return null;
  const prefix = `${reference.bookId},${reference.chapter},`;
  return (await response.text())
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix))
    .map((line) => {
      const match = line.match(/^\d+,\d+,(\d+),(.*)$/);
      return match
        ? { verse: Number(match[1]), text: decodeCsvText(match[2]) }
        : null;
    })
    .filter((item): item is ChapterVerse => item !== null);
}

export async function fetchReferenceVerses(
  reference: BibleReference,
  version: string,
): Promise<ChapterVerse[]> {
  const providers = [fromPythonAnywhere, fromHelloAo, fromBibleDatabases];
  for (const provider of providers) {
    try {
      const verses = await provider(reference, version);
      if (verses) return verses;
    } catch {
      // The next source keeps reference lookup resilient during host transitions.
    }
  }
  throw new Error(`Reference lookup is unavailable for ${version}.`);
}
