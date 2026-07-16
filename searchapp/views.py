"""Thin Django HTTP adapters for the mBAB application services."""

from __future__ import annotations

from django.http import JsonResponse
from django.shortcuts import render

from .ai import explain_verse
from .catalog import (
    ALL_BOOK_IDS,
    ALL_BOOK_MASK,
    BOOKS,
    BOOK_SECTIONS,
    TESTAMENTS,
    VERSIONS,
    get_book_by_name,
    get_version,
    normalize_version,
)
from .search import SearchRequest, SearchService, parse_book_mask

try:
    from .gtag_secret import GTAG_ID
except ImportError:
    GTAG_ID = None


search_service = SearchService()


def _context(
    *,
    rows: list[dict[str, object]] | None = None,
    version: str | None = None,
    query: str = "",
    selected_books: frozenset[int] = ALL_BOOK_IDS,
    case_sensitive: bool = False,
    generated_expression: str | None = None,
) -> dict[str, object]:
    edition = get_version(version)
    return {
        "testaments": TESTAMENTS,
        "books": BOOKS,
        "versions": VERSIONS,
        "book_sections": BOOK_SECTIONS,
        "rows": rows or [],
        "version_name": edition.id,
        "version_exp": edition.label,
        "version_wiki": edition.info_url,
        "case_sensitive": case_sensitive,
        "keywords": query.split(),
        "search": query,
        "selBooks": " ".join(f"{book_id:02}" for book_id in sorted(selected_books)),
        "gtag_id": GTAG_ID,
        "generated_sql": generated_expression,
    }


def index(request, *args, **kwargs):
    """Render the search page or restore a shared legacy search URL."""
    del args, kwargs
    if request.GET.get("keyword") and request.GET.get("books"):
        return search(request)
    return render(request, "index.html", _context(version=request.GET.get("version")))


def search(request, *args, **kwargs):
    """Render results for a traditional form submission."""
    del args, kwargs
    query = request.GET.get("keyword", "").strip()
    version = normalize_version(request.GET.get("version"))
    case_sensitive = request.GET.get("case", "False") == "True"
    try:
        selected_books = parse_book_mask(
            request.GET.get("books") or str(ALL_BOOK_MASK)
        )
        outcome = search_service.search(
            SearchRequest(query, version, case_sensitive, selected_books)
        )
    except (ValueError, FileNotFoundError) as error:
        return render(
            request,
            "index.html",
            _context(
                version=version,
                query=query,
                case_sensitive=case_sensitive,
                selected_books=selected_books
                if "selected_books" in locals()
                else ALL_BOOK_IDS,
            )
            | {"error": str(error)},
            status=400 if isinstance(error, ValueError) else 503,
        )
    return render(
        request,
        "index.html",
        _context(
            rows=outcome.result_payloads(),
            version=version,
            query=query,
            selected_books=selected_books,
            case_sensitive=case_sensitive,
            generated_expression=outcome.generated_expression,
        ),
    )


def search_ajax(request):
    """Return highlighted search results for either interactive client."""
    query = (request.GET.get("search") or request.GET.get("keyword") or "").strip()
    if not query:
        return JsonResponse({"error": "Enter a search query."}, status=400)

    version = normalize_version(request.GET.get("version"))
    case_sensitive = request.GET.get("case", "False") == "True"
    try:
        selected_books = parse_book_mask(
            request.GET.get("books") or str(ALL_BOOK_MASK)
        )
        outcome = search_service.search(
            SearchRequest(query, version, case_sensitive, selected_books)
        )
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)
    except FileNotFoundError as error:
        return JsonResponse({"error": str(error)}, status=503)

    return JsonResponse(
        {
            "results": outcome.result_payloads(),
            "generated_sql": outcome.generated_expression,
        }
    )


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
    book = get_book_by_name(book_name)
    if book is None:
        return JsonResponse({"error": f"Unknown book: {book_name}"}, status=400)
    try:
        chapter = int(request.GET.get("chapter", ""))
        if chapter < 1:
            raise ValueError
    except ValueError:
        return JsonResponse({"error": "Chapter must be a positive integer."}, status=400)

    version = normalize_version(request.GET.get("version"))
    try:
        verses = search_service.chapter(book.id, chapter, version)
    except FileNotFoundError as error:
        return JsonResponse({"error": str(error)}, status=503)
    return JsonResponse(
        {
            "book": book.name,
            "chapter": chapter,
            "version": version,
            "verses": verses,
        }
    )
