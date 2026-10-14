"""Typed access to mBAB's canonical cross-runtime search contract."""

from __future__ import annotations

import json
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CONTRACT_PATH = Path(__file__).resolve().parent.parent / "contracts" / "search.json"
SUPPORTED_SCHEMA_VERSION = 1


@dataclass(frozen=True, slots=True)
class BibleBook:
    id: int
    name: str
    abbreviation: str
    testament: str
    section: str

    @property
    def number(self) -> str:
        """Return the two-digit identifier expected by the legacy template."""
        return f"{self.id:02}"


@dataclass(frozen=True, slots=True)
class BibleVersion:
    id: str
    label: str
    info_url: str


@dataclass(frozen=True, slots=True)
class SearchMode:
    id: str
    label: str
    description: str


@dataclass(frozen=True, slots=True)
class BookGroup:
    id: str
    label: str
    book_ids: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class BookSection:
    testament: str
    name: str
    book_ids: tuple[int, ...]


def _load_contract() -> dict[str, Any]:
    try:
        payload = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Unable to load the mBAB search contract: {error}") from error
    if not isinstance(payload, dict):
        raise RuntimeError("The mBAB search contract must contain a JSON object.")
    return payload


def _validate_contract(payload: dict[str, Any]) -> None:
    if payload.get("schema_version") != SUPPORTED_SCHEMA_VERSION:
        raise RuntimeError("Unsupported mBAB search contract schema version.")

    books = payload.get("books", [])
    book_ids = [book.get("id") for book in books]
    if book_ids != list(range(66)):
        raise RuntimeError("The mBAB catalog must contain canonical book IDs 0 through 65.")

    version_ids = [version.get("id") for version in payload.get("versions", [])]
    if len(version_ids) != len(set(version_ids)) or not version_ids:
        raise RuntimeError("The mBAB version catalog must contain unique edition IDs.")
    if payload.get("default_version") not in version_ids:
        raise RuntimeError("The default edition is missing from the version catalog.")

    valid_book_ids = set(book_ids)
    for group in payload.get("groups", []):
        if not set(group.get("book_ids", [])).issubset(valid_book_ids):
            raise RuntimeError(f"Book group {group.get('id')!r} contains an unknown book.")


_CONTRACT = _load_contract()
_validate_contract(_CONTRACT)

DEFAULT_VERSION = str(_CONTRACT["default_version"])
MODES = tuple(SearchMode(**item) for item in _CONTRACT["modes"])
VERSIONS = tuple(BibleVersion(**item) for item in _CONTRACT["versions"])
BOOKS = tuple(BibleBook(**item) for item in _CONTRACT["books"])
BOOK_GROUPS = tuple(
    BookGroup(
        id=item["id"],
        label=item["label"],
        book_ids=tuple(item["book_ids"]),
    )
    for item in _CONTRACT["groups"]
)

BOOK_BY_ID = {book.id: book for book in BOOKS}
BOOK_BY_NAME = {book.name.casefold(): book for book in BOOKS}
VERSION_BY_ID = {version.id: version for version in VERSIONS}
MODE_BY_ID = {mode.id: mode for mode in MODES}
ALL_BOOK_IDS = frozenset(BOOK_BY_ID)
ALL_BOOK_MASK = (1 << len(ALL_BOOK_IDS)) - 1
TESTAMENTS = tuple(dict.fromkeys(book.testament for book in BOOKS))

_sections: OrderedDict[tuple[str, str], list[int]] = OrderedDict()
for _book in BOOKS:
    _sections.setdefault((_book.testament, _book.section), []).append(_book.id)
BOOK_SECTIONS = tuple(
    BookSection(testament, name, tuple(ids))
    for (testament, name), ids in _sections.items()
)


def normalize_version(value: str | None) -> str:
    """Return a supported edition ID, falling back to the contract default."""
    normalized = (value or "").strip().upper()
    return normalized if normalized in VERSION_BY_ID else DEFAULT_VERSION


def get_version(value: str | None) -> BibleVersion:
    """Return catalog metadata for a requested edition."""
    return VERSION_BY_ID[normalize_version(value)]


def get_book_by_name(value: str) -> BibleBook | None:
    """Resolve a full Bible book name without depending on display casing."""
    return BOOK_BY_NAME.get(value.strip().casefold())
