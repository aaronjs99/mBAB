"""Django views and search helpers for mBAB."""

from __future__ import annotations

import logging
import re
import sqlite3
from pathlib import Path
from typing import Any

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render

from .bibledata import (
    book_sections,
    books,
    parse_verse_reference,
    sql_order,
    sql_select,
    testaments,
    versions,
)
from .llm_interface import detect_intent, explain_verse, generate_search_expression

try:
    from .gtag_secret import GTAG_ID
except ImportError:
    GTAG_ID = None


logger = logging.getLogger(__name__)

BOOK_BY_ID = {book["id"]: book for book in books}
VERSION_BY_NAME = {version["name"]: version for version in versions}
DEFAULT_VERSION = "KJV"
ALL_BOOK_IDS = frozenset(BOOK_BY_ID)
ALL_BOOK_MASK = (1 << len(BOOK_BY_ID)) - 1


def index(request, *args, **kwargs):
    """Render the search page or restore a shared search URL."""
    if request.GET.get("keyword") and request.GET.get("books"):
        return search(request)
    return db_refresh(request, blank=True)


def search(request, *args, **kwargs):
    """Render results for a traditional form submission."""
    return db_refresh(
        request,
        input_words=request.GET.get("keyword", ""),
        version_name=request.GET.get("version", ""),
    )


def dict_factory(cursor, row):
    """Convert a SQLite row into a dictionary."""
    return {column[0]: row[index] for index, column in enumerate(cursor.description)}


def normalize_version(version_name: str | None) -> str:
    """Return a supported version name, falling back to KJV."""
    if version_name in VERSION_BY_NAME:
        return str(version_name)
    return DEFAULT_VERSION


def find_version(version_name: str) -> tuple[str, str]:
    """Return the display name and information URL for a version."""
    version = VERSION_BY_NAME[normalize_version(version_name)]
    return version["expansion"], version["wiki"]


def database_path(version_name: str) -> Path:
    """Return the canonical local database path for a supported version."""
    version = normalize_version(version_name)
    return Path(settings.BASE_DIR) / "databases" / f"{version}Bible_Database.db"


def sort_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort rows in canonical Bible order."""
    return sorted(
        rows, key=lambda row: (row["Book"], row["Chapter"], row["Versecount"])
    )


def tokenize_expr(expression: str) -> list[str]:
    """Split a Boolean expression into words, operators, and parentheses."""
    expression = re.sub(r"\bAND\b", "+", expression, flags=re.IGNORECASE)
    expression = re.sub(r"\bOR\b", ",", expression, flags=re.IGNORECASE)
    return re.findall(r"\w+|[(),+]", expression)


def to_postfix(tokens: list[str]) -> list[str]:
    """Convert infix Boolean tokens to postfix notation."""
    precedence = {"+": 2, ",": 1}
    output: list[str] = []
    operators: list[str] = []

    for token in tokens:
        if token.isalnum():
            output.append(token)
        elif token in precedence:
            while (
                operators
                and operators[-1] in precedence
                and precedence[operators[-1]] >= precedence[token]
            ):
                output.append(operators.pop())
            operators.append(token)
        elif token == "(":
            operators.append(token)
        elif token == ")":
            while operators and operators[-1] != "(":
                output.append(operators.pop())
            if not operators:
                raise ValueError("Unmatched closing parenthesis.")
            operators.pop()

    if "(" in operators:
        raise ValueError("Unmatched opening parenthesis.")
    output.extend(reversed(operators))
    return output


def regexp_check(pattern: str, value: object, case_sensitive: bool = False) -> bool:
    """Implement SQLite REGEXP with optional case sensitivity."""
    if value is None:
        return False
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.search(pattern, str(value), flags) is not None


def build_sql_from_postfix(
    postfix_tokens: list[str], case_sensitive: bool = False
) -> tuple[str, list[str]]:
    """Build a parameterized SQL WHERE clause from postfix tokens."""
    del case_sensitive  # Matching behavior is supplied by SQLite's REGEXP callback.
    stack: list[tuple[str, list[str]]] = []

    for token in postfix_tokens:
        if token.isalnum():
            stack.append(("verse REGEXP ?", [rf"\b{re.escape(token)}\b"]))
            continue

        if token not in {"+", ","} or len(stack) < 2:
            raise ValueError("The Boolean search expression is incomplete.")

        right_expression, right_values = stack.pop()
        left_expression, left_values = stack.pop()
        operator = "AND" if token == "+" else "OR"
        stack.append(
            (
                f"({left_expression} {operator} {right_expression})",
                left_values + right_values,
            )
        )

    if len(stack) != 1:
        return "1=0", []
    return stack[0]


def _reference_query(reference: dict[str, int | None]) -> tuple[str, list[int]]:
    book_id = int(reference["book_id"])
    chapter = int(reference["chapter"])
    start_verse = reference["start_verse"]
    end_verse = reference["end_verse"]

    if start_verse is None:
        return "Book = ? AND Chapter = ?", [book_id, chapter]
    if start_verse == end_verse:
        return "Book = ? AND Chapter = ? AND Versecount = ?", [
            book_id,
            chapter,
            int(start_verse),
        ]
    return "Book = ? AND Chapter = ? AND Versecount BETWEEN ? AND ?", [
        book_id,
        chapter,
        int(start_verse),
        int(end_verse),
    ]


def _search_expression(
    expression: str,
    version_name: str,
    case_sensitive: bool,
    highlight_context: dict[str, Any],
) -> tuple[str, list[object]]:
    reference = parse_verse_reference(expression)
    if reference:
        highlight_context["words"] = []
        return _reference_query(reference)

    if expression.lstrip().upper().startswith("SELECT "):
        raise ValueError("Raw SQL is not accepted. Use mBAB Boolean syntax instead.")

    clean_expression = re.sub(
        r"^(key:|search:)\s*", "", expression, flags=re.IGNORECASE
    ).strip()
    evaluated_expression = clean_expression

    if detect_intent(clean_expression) == "LLM":
        generated_expression, error = generate_search_expression(
            clean_expression, version_name
        )
        if generated_expression and not error:
            evaluated_expression = generated_expression
            highlight_context["generated_sql"] = generated_expression
        elif error:
            logger.info("LLM parsing unavailable; using the original query: %s", error)

    tokens = tokenize_expr(evaluated_expression)
    postfix = to_postfix(tokens)
    where_clause, values = build_sql_from_postfix(postfix, case_sensitive)
    highlight_context["words"] = [token for token in tokens if token.isalnum()]
    return where_clause, values


def sql_row_gen(
    expression: str,
    version_name: str,
    case_sensitive: bool = False,
    highlight_context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Execute one safe Bible search and return dictionary rows."""
    context = highlight_context if highlight_context is not None else {}
    version = normalize_version(version_name)
    where_clause, values = _search_expression(
        expression, version, case_sensitive, context
    )
    sql_command = f"{sql_select} {where_clause} {sql_order}"
    path = database_path(version)
    if not path.is_file():
        raise FileNotFoundError(f"The {version} Bible database is not installed.")

    with sqlite3.connect(path) as database:
        database.row_factory = dict_factory
        database.create_function(
            "REGEXP",
            2,
            lambda pattern, value: regexp_check(pattern, value, case_sensitive),
        )
        cursor = database.execute(sql_command, values)
        return cursor.fetchall()


def parse_book_mask(value: str | None) -> set[int]:
    """Decode the 66-bit client book mask into book IDs."""
    if not value:
        return set(ALL_BOOK_IDS)
    if not value.isdigit():
        raise ValueError("The selected-book mask must be a non-negative integer.")
    mask = int(value)
    return {book_id for book_id in ALL_BOOK_IDS if mask & (1 << book_id)}


def _highlight_parts(
    verse: str, words: list[str], case_sensitive: bool
) -> list[dict[str, str]]:
    if not words:
        return [{"text": verse}]

    pattern = "|".join(rf"\b{re.escape(word)}\b" for word in words)
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
    return parts or [{"text": verse}]


def format_rows(
    raw_rows: list[dict[str, Any]],
    selected_book_ids: set[int],
    highlight_words: list[str],
    case_sensitive: bool,
) -> list[dict[str, Any]]:
    """Filter, label, and highlight raw database rows for the UI."""
    rows: list[dict[str, Any]] = []
    for row in sort_rows(raw_rows):
        book_id = int(row["Book"])
        if book_id not in selected_book_ids:
            continue
        rows.append(
            {
                "Book": BOOK_BY_ID[book_id]["text"],
                "Chapter": row["Chapter"],
                "Versecount": row["Versecount"],
                "verse": _highlight_parts(
                    str(row["verse"]), highlight_words, case_sensitive
                ),
            }
        )
    return rows


def run_search(
    expression: str,
    version_name: str,
    case_sensitive: bool,
    book_mask: str | None,
) -> tuple[list[dict[str, Any]], str | None]:
    """Run the shared search pipeline used by HTML and JSON responses."""
    highlight_context: dict[str, Any] = {}
    raw_rows = sql_row_gen(
        expression,
        version_name,
        case_sensitive,
        highlight_context,
    )
    rows = format_rows(
        raw_rows,
        parse_book_mask(book_mask),
        highlight_context.get("words", []),
        case_sensitive,
    )
    return rows, highlight_context.get("generated_sql")


def build_context(
    rows,
    version_name,
    version_exp,
    version_wiki,
    input_words,
    selected_books,
    case_sensitive,
    keywords=None,
    generated_sql=None,
):
    """Build the context shared by the initial page and rendered results."""
    return {
        "testaments": testaments,
        "books": books,
        "versions": versions,
        "book_sections": book_sections,
        "rows": rows,
        "version_name": version_name,
        "version_exp": version_exp,
        "version_wiki": version_wiki,
        "case_sensitive": case_sensitive,
        "keywords": keywords if keywords is not None else input_words.split(),
        "search": input_words,
        "selBooks": selected_books,
        "gtag_id": GTAG_ID,
        "generated_sql": generated_sql,
    }


def db_refresh(request, *args, **kwargs):
    """Render the initial page or server-rendered search results."""
    blank = kwargs.get("blank", False)
    input_words = kwargs.get("input_words", "")
    version_name = normalize_version(
        kwargs.get("version_name") or request.GET.get("version")
    )
    version_exp, version_wiki = find_version(version_name)

    if blank:
        selected_books = " ".join(book["num"] for book in books)
        return render(
            request,
            "index.html",
            build_context(
                [],
                version_name,
                version_exp,
                version_wiki,
                input_words,
                selected_books,
                False,
            ),
        )

    case_sensitive = request.GET.get("case", "False") == "True"
    book_mask = request.GET.get("books") or str(ALL_BOOK_MASK)
    selected_ids = parse_book_mask(book_mask)
    selected_books = " ".join(f"{book_id:02}" for book_id in sorted(selected_ids))
    rows, generated_expression = run_search(
        input_words, version_name, case_sensitive, book_mask
    )

    return render(
        request,
        "index.html",
        build_context(
            rows,
            version_name,
            version_exp,
            version_wiki,
            input_words,
            selected_books,
            case_sensitive,
            generated_sql=generated_expression,
        ),
    )


def search_ajax(request):
    """Return highlighted search results for the interactive client."""
    keyword = (request.GET.get("search") or request.GET.get("keyword") or "").strip()
    if not keyword:
        return JsonResponse({"error": "Enter a search query."}, status=400)

    version = normalize_version(request.GET.get("version"))
    case_sensitive = request.GET.get("case", "False") == "True"
    book_mask = request.GET.get("books") or str(ALL_BOOK_MASK)

    try:
        rows, generated_expression = run_search(
            keyword, version, case_sensitive, book_mask
        )
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)
    except FileNotFoundError as error:
        return JsonResponse({"error": str(error)}, status=503)

    return JsonResponse({"results": rows, "generated_sql": generated_expression})


def explain(request):
    """Generate a short AI explanation for one verse."""
    reference = request.GET.get("ref", "").strip()
    text = request.GET.get("text", "").strip()
    if not reference or not text:
        return JsonResponse({"error": "Missing reference or text."}, status=400)

    explanation, error = explain_verse(reference, text)
    if error:
        return JsonResponse({"error": error}, status=503)
    return JsonResponse({"explanation": explanation})


def chapter_text(request):
    """Return the full text of one chapter in a supported edition."""
    book_name = request.GET.get("book", "").strip()
    version = normalize_version(request.GET.get("version"))
    try:
        chapter = int(request.GET.get("chapter", ""))
    except ValueError:
        return JsonResponse(
            {"error": "Chapter must be a positive integer."}, status=400
        )

    if chapter < 1:
        return JsonResponse(
            {"error": "Chapter must be a positive integer."}, status=400
        )

    book = next(
        (item for item in books if item["text"].casefold() == book_name.casefold()),
        None,
    )
    if book is None:
        return JsonResponse({"error": f"Unknown book: {book_name}"}, status=400)

    path = database_path(version)
    if not path.is_file():
        return JsonResponse(
            {"error": f"The {version} Bible database is not installed."}, status=503
        )

    with sqlite3.connect(path) as database:
        database.row_factory = sqlite3.Row
        rows = database.execute(
            "SELECT Versecount, verse AS text FROM bible "
            "WHERE Book = ? AND Chapter = ? ORDER BY Versecount",
            (book["id"], chapter),
        ).fetchall()

    return JsonResponse(
        {
            "book": book["text"],
            "chapter": chapter,
            "version": version,
            "verses": [
                {"verse": row["Versecount"], "text": row["text"]} for row in rows
            ],
        }
    )
