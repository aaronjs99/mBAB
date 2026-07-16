"""Application-level orchestration for Bible search."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Callable

from . import ai
from .catalog import ALL_BOOK_IDS, BOOK_BY_ID, DEFAULT_VERSION, normalize_version
from .query import QueryKind, classify_query, compile_query, fallback_expression
from .repository import BibleRepository


logger = logging.getLogger(__name__)
ExpressionGenerator = Callable[[str, str], tuple[str | None, str | None]]
RepositoryFactory = Callable[..., BibleRepository]


@dataclass(frozen=True, slots=True)
class SearchRequest:
    expression: str
    version: str = DEFAULT_VERSION
    case_sensitive: bool = False
    book_ids: frozenset[int] = ALL_BOOK_IDS


@dataclass(frozen=True, slots=True)
class SearchResult:
    book: str
    chapter: int
    verse_number: int
    text_parts: tuple[dict[str, str], ...]

    def to_payload(self) -> dict[str, object]:
        """Preserve the JSON shape consumed by both mBAB frontends."""
        return {
            "Book": self.book,
            "Chapter": self.chapter,
            "Versecount": self.verse_number,
            "verse": list(self.text_parts),
        }


@dataclass(frozen=True, slots=True)
class SearchOutcome:
    results: tuple[SearchResult, ...]
    evaluated_expression: str
    generated_expression: str | None = None

    def result_payloads(self) -> list[dict[str, object]]:
        return [result.to_payload() for result in self.results]


def parse_book_mask(value: str | None) -> frozenset[int]:
    """Decode the 66-bit client-side book mask."""
    if value is None or value == "":
        return ALL_BOOK_IDS
    if not value.isdigit():
        raise ValueError("The selected-book mask must be a non-negative integer.")
    mask = int(value)
    return frozenset(book_id for book_id in ALL_BOOK_IDS if mask & (1 << book_id))


def _highlight_parts(
    verse: str, terms: tuple[str, ...], case_sensitive: bool
) -> tuple[dict[str, str], ...]:
    if not terms:
        return ({"text": verse},)

    pattern = "|".join(rf"\b{re.escape(term)}\b" for term in terms)
    flags = 0 if case_sensitive else re.IGNORECASE
    parts: list[dict[str, str]] = []
    cursor = 0
    for match in re.finditer(pattern, verse, flags=flags):
        start, end = match.span()
        if start > cursor:
            parts.append({"text": verse[cursor:start]})
        parts.append({"highlight": verse[start:end]})
        cursor = end
    if cursor < len(verse):
        parts.append({"text": verse[cursor:]})
    return tuple(parts or [{"text": verse}])


class SearchService:
    """Coordinate optional parsing, safe compilation, repository access, and UI data."""

    def __init__(
        self,
        *,
        repository_factory: RepositoryFactory = BibleRepository,
        expression_generator: ExpressionGenerator | None = None,
    ) -> None:
        self.repository_factory = repository_factory
        self.expression_generator = expression_generator

    def search(self, request: SearchRequest) -> SearchOutcome:
        version = normalize_version(request.version)
        evaluated = request.expression.strip()
        generated: str | None = None

        if classify_query(evaluated) is QueryKind.NATURAL:
            generator = self.expression_generator or ai.generate_search_expression
            candidate, error = generator(evaluated, version)
            if candidate and not error:
                evaluated = candidate
                generated = candidate
            else:
                evaluated = fallback_expression(evaluated)
                if error:
                    logger.info("AI parsing unavailable; using deterministic parsing: %s", error)

        compiled = compile_query(evaluated)
        repository = self.repository_factory(
            version, case_sensitive=request.case_sensitive
        )
        rows = repository.search(compiled)
        results = tuple(
            SearchResult(
                book=BOOK_BY_ID[int(row["Book"])].name,
                chapter=int(row["Chapter"]),
                verse_number=int(row["Versecount"]),
                text_parts=_highlight_parts(
                    str(row["verse"]), compiled.highlight_terms, request.case_sensitive
                ),
            )
            for row in rows
            if int(row["Book"]) in request.book_ids
        )
        return SearchOutcome(results, evaluated, generated)

    def chapter(
        self, book_id: int, chapter: int, version: str
    ) -> list[dict[str, object]]:
        repository = self.repository_factory(normalize_version(version))
        return repository.chapter(book_id, chapter)
