"""SQLite-backed Bible text repository."""

from __future__ import annotations

import re
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Callable

from .catalog import DEFAULT_VERSION, normalize_version
from .query import CompiledQuery
from .verse_text import plain_verse_text


DatabasePathResolver = Callable[[str], Path]


def default_database_path(version: str) -> Path:
    """Return the repository path for an installed Bible edition."""
    root = Path(__file__).resolve().parent.parent
    return root / "databases" / f"{version}Bible_Database.db"


def regexp_matches(pattern: str, value: object, case_sensitive: bool = False) -> bool:
    """Implement the SQLite REGEXP callback with explicit case behavior."""
    if value is None:
        return False
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.search(pattern, str(value), flags) is not None


class BibleRepository:
    """Read one installed edition through a narrow, injectable interface."""

    def __init__(
        self,
        version: str = DEFAULT_VERSION,
        *,
        case_sensitive: bool = False,
        path_resolver: DatabasePathResolver = default_database_path,
    ) -> None:
        self.version = normalize_version(version)
        self.case_sensitive = case_sensitive
        self.path = path_resolver(self.version)

    def _connect(self) -> sqlite3.Connection:
        if not self.path.is_file():
            raise FileNotFoundError(
                f"The {self.version} Bible database is not installed."
            )
        database = sqlite3.connect(self.path)
        database.row_factory = sqlite3.Row
        database.create_function(
            "REGEXP",
            2,
            lambda pattern, value: regexp_matches(
                pattern, plain_verse_text(value, self.version), self.case_sensitive
            ),
        )
        return database

    def search(self, query: CompiledQuery) -> list[dict[str, object]]:
        """Return canonical verse rows matching a compiled query."""
        command = (
            "SELECT Book, Chapter, Versecount, verse FROM bible WHERE "
            f"{query.where_clause} ORDER BY Book, Chapter, Versecount"
        )
        with closing(self._connect()) as database:
            rows = database.execute(command, query.parameters).fetchall()
        return [
            {**dict(row), "verse": text} for row in rows
            if (text := plain_verse_text(row["verse"], self.version)).strip()
        ]

    def chapter(self, book_id: int, chapter: int) -> list[dict[str, object]]:
        """Return one complete chapter in verse order."""
        with closing(self._connect()) as database:
            rows = database.execute(
                "SELECT Versecount AS verse, verse AS text FROM bible "
                "WHERE Book = ? AND Chapter = ? ORDER BY Versecount",
                (book_id, chapter),
            ).fetchall()
        return [
            {**dict(row), "text": text} for row in rows
            if (text := plain_verse_text(row["text"], self.version)).strip()
        ]
