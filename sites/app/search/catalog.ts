import contractJson from "../../../contracts/search.json";
import type { BibleBook, BibleVersion, SearchMode } from "./types";

type Contract = {
  schema_version: number;
  default_version: string;
  modes: Array<{ id: SearchMode; label: string; description: string }>;
  versions: Array<{ id: string; label: string; info_url: string }>;
  books: BibleBook[];
  groups: Array<{ id: string; label: string; book_ids: number[] }>;
};

const contract = contractJson as Contract;

function validateContract(value: Contract) {
  const bookIds = value.books.map((book) => book.id);
  const canonicalIds = Array.from({ length: 66 }, (_, id) => id);
  if (
    value.schema_version !== 1
    || bookIds.some((id, index) => id !== canonicalIds[index])
    || !value.versions.some((version) => version.id === value.default_version)
  ) {
    throw new Error("The shared mBAB search contract is invalid.");
  }
}

validateContract(contract);

export const DEFAULT_VERSION = contract.default_version;
export const SEARCH_MODES = contract.modes;
export const BOOKS: BibleBook[] = contract.books;
export const VERSIONS: BibleVersion[] = contract.versions.map((version) => ({
  id: version.id,
  label: version.label,
  short: version.id,
  infoUrl: version.info_url,
}));
export const BOOK_GROUPS = contract.groups.map((group) => ({
  id: group.id,
  label: group.label,
  ids: group.book_ids,
}));
export const ALL_BOOK_IDS = BOOKS.map((book) => book.id);

export function modeDescription(mode: SearchMode): string {
  return SEARCH_MODES.find((item) => item.id === mode)?.description ?? "";
}

export function bookMask(ids: readonly number[]): string {
  let value = BigInt(0);
  for (const id of ids) {
    if (Number.isInteger(id) && id >= 0 && id < BOOKS.length) {
      value |= BigInt(1) << BigInt(id);
    }
  }
  return value.toString();
}

export function isSearchMode(value: string | null): value is SearchMode {
  return SEARCH_MODES.some((mode) => mode.id === value);
}

export function isVersion(value: string | null): value is string {
  return VERSIONS.some((version) => version.id === value);
}
