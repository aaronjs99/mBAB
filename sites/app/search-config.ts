export type SearchMode = "all" | "any" | "advanced";

export type BibleBook = {
  id: number;
  name: string;
  abbreviation: string;
  testament: "Old Testament" | "New Testament";
  section: string;
};

const OLD_TESTAMENT = [
  ["Genesis", "Gen", "Law"], ["Exodus", "Ex", "Law"], ["Leviticus", "Lev", "Law"],
  ["Numbers", "Num", "Law"], ["Deuteronomy", "Deut", "Law"], ["Joshua", "Josh", "History"],
  ["Judges", "Judg", "History"], ["Ruth", "Ruth", "History"], ["1 Samuel", "1 Sam", "History"],
  ["2 Samuel", "2 Sam", "History"], ["1 Kings", "1 Kgs", "History"], ["2 Kings", "2 Kgs", "History"],
  ["1 Chronicles", "1 Chr", "History"], ["2 Chronicles", "2 Chr", "History"], ["Ezra", "Ezra", "History"],
  ["Nehemiah", "Neh", "History"], ["Esther", "Esth", "History"], ["Job", "Job", "Wisdom"],
  ["Psalms", "Ps", "Wisdom"], ["Proverbs", "Prov", "Wisdom"], ["Ecclesiastes", "Eccl", "Wisdom"],
  ["Song of Solomon", "Song", "Wisdom"], ["Isaiah", "Isa", "Major Prophets"],
  ["Jeremiah", "Jer", "Major Prophets"], ["Lamentations", "Lam", "Major Prophets"],
  ["Ezekiel", "Ezek", "Major Prophets"], ["Daniel", "Dan", "Major Prophets"],
  ["Hosea", "Hos", "Minor Prophets"], ["Joel", "Joel", "Minor Prophets"], ["Amos", "Amos", "Minor Prophets"],
  ["Obadiah", "Obad", "Minor Prophets"], ["Jonah", "Jonah", "Minor Prophets"], ["Micah", "Mic", "Minor Prophets"],
  ["Nahum", "Nah", "Minor Prophets"], ["Habakkuk", "Hab", "Minor Prophets"],
  ["Zephaniah", "Zeph", "Minor Prophets"], ["Haggai", "Hag", "Minor Prophets"],
  ["Zechariah", "Zech", "Minor Prophets"], ["Malachi", "Mal", "Minor Prophets"],
] as const;

const NEW_TESTAMENT = [
  ["Matthew", "Matt", "Gospels"], ["Mark", "Mark", "Gospels"], ["Luke", "Luke", "Gospels"],
  ["John", "John", "Gospels"], ["Acts", "Acts", "History"], ["Romans", "Rom", "Pauline Letters"],
  ["1 Corinthians", "1 Cor", "Pauline Letters"], ["2 Corinthians", "2 Cor", "Pauline Letters"],
  ["Galatians", "Gal", "Pauline Letters"], ["Ephesians", "Eph", "Pauline Letters"],
  ["Philippians", "Phil", "Pauline Letters"], ["Colossians", "Col", "Pauline Letters"],
  ["1 Thessalonians", "1 Thess", "Pauline Letters"], ["2 Thessalonians", "2 Thess", "Pauline Letters"],
  ["1 Timothy", "1 Tim", "Pauline Letters"], ["2 Timothy", "2 Tim", "Pauline Letters"],
  ["Titus", "Titus", "Pauline Letters"], ["Philemon", "Phlm", "Pauline Letters"],
  ["Hebrews", "Heb", "General Letters"], ["James", "Jas", "General Letters"],
  ["1 Peter", "1 Pet", "General Letters"], ["2 Peter", "2 Pet", "General Letters"],
  ["1 John", "1 John", "General Letters"], ["2 John", "2 John", "General Letters"],
  ["3 John", "3 John", "General Letters"], ["Jude", "Jude", "General Letters"],
  ["Revelation", "Rev", "Apocalyptic"],
] as const;

export const BOOKS: BibleBook[] = [...OLD_TESTAMENT, ...NEW_TESTAMENT].map(
  ([name, abbreviation, section], id) => ({
    id,
    name,
    abbreviation,
    section,
    testament: id < 39 ? "Old Testament" : "New Testament",
  }),
);

export const VERSIONS = [
  { id: "KJV", label: "King James Version", short: "KJV" },
  { id: "ASV", label: "American Standard Version", short: "ASV" },
  { id: "WEB", label: "World English Bible", short: "WEB" },
  { id: "YLT", label: "Young's Literal Translation", short: "YLT" },
] as const;

export const BOOK_GROUPS = [
  { id: "all", label: "All 66", ids: BOOKS.map((book) => book.id) },
  { id: "old", label: "Old Testament", ids: BOOKS.filter((book) => book.id < 39).map((book) => book.id) },
  { id: "new", label: "New Testament", ids: BOOKS.filter((book) => book.id >= 39).map((book) => book.id) },
  { id: "gospels", label: "Gospels", ids: BOOKS.filter((book) => book.section === "Gospels").map((book) => book.id) },
  { id: "wisdom", label: "Wisdom", ids: BOOKS.filter((book) => book.section === "Wisdom").map((book) => book.id) },
  { id: "letters", label: "Letters", ids: BOOKS.filter((book) => book.section.includes("Letters")).map((book) => book.id) },
] as const;

export function bookMask(ids: number[]): string {
  let value = BigInt(0);
  for (const id of ids) {
    if (Number.isInteger(id) && id >= 0 && id < 66) {
      value |= BigInt(1) << BigInt(id);
    }
  }
  return value.toString();
}

export function modeDescription(mode: SearchMode): string {
  if (mode === "all") return "Every word must appear in the same verse.";
  if (mode === "any") return "A verse may contain any of the words.";
  return "+ means AND, comma means OR, and parentheses control grouping.";
}

