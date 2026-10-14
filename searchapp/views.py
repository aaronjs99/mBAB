import re, sqlite3
from django.shortcuts import render
from django.http import JsonResponse

from .bibledata import (
    testaments,
    book_sections,
    books,
    versions,
    sql_select,
    sql_order,
    parse_verse_reference,
)
import sys
from .llm_interface import detect_intent, generate_search_expression, validate_and_sanitize_sql, explain_verse

try:
    from .gtag_secret import GTAG_ID
except ImportError:
    GTAG_ID = None


def index(request, *args, **kwargs):
    """Render homepage or run search if params are in URL (for sharable links)."""
    if request.GET.get("keyword") and request.GET.get("books"):
        return search(request)
    return db_refresh(request, blank=True)


def search(request, *args, **kwargs):
    """Handle the search form submission and render filtered search results."""
    return db_refresh(
        request,
        input_words=request.GET.get("keyword", ""),
        version_name=request.GET.get("version", ""),
    )


def dict_factory(cursor, row):
    """Convert database rows into dictionaries keyed by column name."""
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def find_version(version_name):
    """Return the version expansion and wiki link for a given short version name."""
    version = next(item for item in versions if item["name"] == version_name)
    return version["expansion"], version["wiki"]


def sort_rows(rows):
    """Sort search result rows by book, chapter, and verse order."""
    return sorted(
        rows, key=lambda row: (row["Book"], row["Chapter"], row["Versecount"])
    )


def tokenize_expr(expr):
    """Split a Boolean keyword expression into tokens (words and operators)."""
    # Pre-process natural boolean keywords for Standard Mode convenience
    # Replace " and " with " + " and " or " with " , "
    expr = re.sub(r"\bAND\b", "+", expr, flags=re.IGNORECASE)
    expr = re.sub(r"\bOR\b", ",", expr, flags=re.IGNORECASE)
    return re.findall(r"\w+|[(),+]", expr)


def to_postfix(tokens):
    """
    Convert infix Boolean tokens into postfix (Reverse Polish Notation).

    Uses + as AND, , as OR, and supports parentheses.
    """
    precedence = {"+": 2, ",": 1}
    output = []
    stack = []
    for token in tokens:
        if token.isalnum():
            output.append(token)
        elif token in ("+", ","):
            while (
                stack
                and stack[-1] in precedence
                and precedence[stack[-1]] >= precedence[token]
            ):
                output.append(stack.pop())
            stack.append(token)
        elif token == "(":
            stack.append(token)
        elif token == ")":
            while stack and stack[-1] != "(":
                output.append(stack.pop())
            stack.pop()
    while stack:
        output.append(stack.pop())
    return output


def regexp_check(pattern, item, case_sensitive=False):
    """SQLite REGEXP implementation using Python's re module."""
    if item is None:
        return False
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.search(pattern, str(item), flags) is not None


def build_sql_from_postfix(postfix_tokens, case_sensitive=False):
    """
    Build a safe SQL WHERE clause from postfix Boolean tokens.
    Uses REGEXP with word boundaries for precision.

    Args:
        postfix_tokens: list of tokens in postfix order.
        case_sensitive: if True, performs case-sensitive search.

    Returns:
        A tuple of SQL WHERE clause string and list of values for binding.
    """
    stack = []
    values = []
    for token in postfix_tokens:
        if token.isalnum():
            # Use strict word boundaries so 'grace' doesn't match 'disgrace'
            pattern = f"\\b{re.escape(token)}\\b"
            stack.append(("verse REGEXP ?", [pattern]))
        elif token in ("+", ","):
            op = "AND" if token == "+" else "OR"
            right_expr, right_vals = stack.pop()
            left_expr, left_vals = stack.pop()
            combined_expr = f"({left_expr} {op} {right_expr})"
            stack.append((combined_expr, left_vals + right_vals))
    return stack[0] if stack else ("1=0", [])


def sql_row_gen(expression, version_name, case_sensitive=False, highlight_context=None):
    """
    Execute the SQL query for a given search expression and Bible version.

    Args:
        expression: the Boolean search expression (user input).
        version_name: short name of the Bible version (e.g., "ESV").
        case_sensitive: whether to perform a case-sensitive search.
        highlight_context: optional mutable dict to return metadata (keywords, sql).

    Returns:
        A list of result rows as dictionaries.
    """
    if highlight_context is None:
        highlight_context = {}
    
    # 1. Check for verse reference first
    ref_data = parse_verse_reference(expression)
    if ref_data:
        # It's a verse reference!
        highlight_context["words"] = [] # No highlighting
        book_id = ref_data["book_id"]
        chapter = ref_data["chapter"]
        start_verse = ref_data["start_verse"]
        end_verse = ref_data["end_verse"]
        
        if start_verse is None:
            # Whole chapter
            where_clause = "Book = ? AND Chapter = ?"
            values = [book_id, chapter]
        elif start_verse == end_verse:
            # Single verse
            where_clause = "Book = ? AND Chapter = ? AND Versecount = ?"
            values = [book_id, chapter, start_verse]
        else:
            # Range
            where_clause = "Book = ? AND Chapter = ? AND Versecount >= ? AND Versecount <= ?"
            values = [book_id, chapter, start_verse, end_verse]

        sql_command = f"{sql_select} {where_clause} {sql_order}"

    # 2. Check correctly for RAW SQL (User edited SQL)
    elif expression.strip().upper().startswith("SELECT "):
        sys.stderr.write(f"DEBUG: Raw SQL detected: {expression}\n")
    else:
        # 2. Check Intent (LLM vs Keyword)
        intent = detect_intent(expression)
        sys.stderr.write(f"DEBUG: Query='{expression}', Intent='{intent}'\n")
        
        if intent == "LLM":
            # Generate Boolean Expression via LLM
            generated_expr, error = generate_search_expression(expression, version_name)

            if error or not generated_expr:
                # Fallback to standard keyword search if LLM fails
                sys.stderr.write(f"DEBUG: LLM Error: {error}\n")
                # Treat original expression as standard keyword search
                tokens = tokenize_expr(expression)
                postfix = to_postfix(tokens)
                where_clause, values = build_sql_from_postfix(postfix, case_sensitive)
                sql_command = f"{sql_select} {where_clause} {sql_order}"
                highlight_context["words"] = [t for t in tokens if t.isalnum()]
            else:
                 sys.stderr.write(f"DEBUG: Generated Expression: {generated_expr}\n")
                 
                 # Store generated expression to show user
                 highlight_context["generated_sql"] = generated_expr # Reusing existing key for frontend simplicity

                 # Process the GENERATED expression as a standard search
                 tokens = tokenize_expr(generated_expr)
                 postfix = to_postfix(tokens)
                 where_clause, values = build_sql_from_postfix(postfix, case_sensitive)
                 sql_command = f"{sql_select} {where_clause} {sql_order}"
                 highlight_context["words"] = [t for t in tokens if t.isalnum()]

        else:
            # 3. Standard Keyword Search
            # Strip prefixes if present
            expression = re.sub(r"^(key:|search:)\s*", "", expression, flags=re.IGNORECASE).strip()
            
            tokens = tokenize_expr(expression)
            postfix = to_postfix(tokens)
            where_clause, values = build_sql_from_postfix(postfix, case_sensitive)
            sql_command = f"{sql_select} {where_clause} {sql_order}"
            highlight_context["words"] = [t for t in tokens if t.isalnum()]

    db = sqlite3.connect(f"./databases/{version_name}Bible_Database.db")
    db.row_factory = dict_factory
    
    # Register REGEXP function to support the generated SQL
    db.create_function("REGEXP", 2, lambda pattern, item: regexp_check(pattern, item, case_sensitive))
    
    cur = db.cursor()

    if case_sensitive:
        cur.execute("PRAGMA case_sensitive_like = true;")

    cur.execute(sql_command, values)
    rows = cur.fetchall()
    sys.stderr.write(f"DEBUG: SQL returned {len(rows)} rows.\n")
    cur.close()
    return rows


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
    """
    Build the Django template context dictionary for rendering results.

    Args:
        rows: list of search results (dicts).
        version_name: short version identifier (e.g., "ESV").
        version_exp: full name of the version.
        version_wiki: link to the version's wiki page.
        input_words: the original search expression.
        selected_books: string of selected book numbers.
        case_sensitive: whether search is case-sensitive.
        keywords: optional list of words for highlighting.
        generated_sql: optional generated SQL string for display.

    Returns:
        A dictionary suitable for rendering the template.
    """
    if keywords is None:
        keywords = input_words.split()
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
        "keywords": keywords,
        "search": input_words,
        "selBooks": selected_books,
        "gtag_id": GTAG_ID,
        "generated_sql": generated_sql,
    }


def db_refresh(request, *args, **kwargs):
    """
    Core dispatcher for handling search and filter logic.

    Args:
        request: Django request object.
        kwargs may include:
          - input_words: search query string
          - version_name: short version name
          - blank: whether to initialize empty context
          - flip_case: toggle case sensitivity
          - flip_book: book number to toggle
          - flip_test: testament key to toggle (ot, nt, bib)

    Returns:
        HttpResponse rendered with `index.html` and appropriate context.
    """
    blank = kwargs.get("blank", False)

    input_words = kwargs.get("input_words", "")
    version_name = kwargs.get("version_name") or request.GET.get(
        "version", versions[0]["name"]
    )
    version_exp, version_wiki = find_version(version_name)

    if blank:
        return render(
            request,
            "index.html",
            build_context(
                rows=[],
                version_name=version_name,
                version_exp=version_exp,
                version_wiki=version_wiki,
                input_words=input_words,
                selected_books=" ".join(book["num"] for book in books),
                case_sensitive=False,
            ),
        )

    case_sensitive = request.GET.get("case", "False") == "True"
    books_param = request.GET.get("books", "")
    selected_books = ""

    if books_param.isdigit():
        bits = f"{int(books_param):066b}"[::-1]
        selected_books = " ".join(f"{i:02}" for i, bit in enumerate(bits) if bit == "1")

    highlight_context = {}
    raw_rows = sort_rows(sql_row_gen(input_words, version_name, case_sensitive, highlight_context))
    highlight_words = highlight_context.get("words", [])
    generated_sql = highlight_context.get("generated_sql", None)

    rows = []
    for row in raw_rows:
        if f"{row['Book']:02}" in selected_books:
            book_text = next(b for b in books if b["id"] == row["Book"])["text"]
            rows.append(
                {
                    "Book": book_text,
                    "Chapter": row["Chapter"],
                    "Versecount": row["Versecount"],
                    "verse": row["verse"],
                }
            )

    for row in rows:
        if highlight_words:
            regex = "|".join(f"\\b{re.escape(word)}\\b" for word in highlight_words)
            verse_text = row["verse"]
            matches = list(
                re.finditer(
                    regex, verse_text, flags=0 if case_sensitive else re.IGNORECASE
                )
            )

            parts = []
            last_idx = 0
            for match in matches:
                start, end = match.span()
                if start > last_idx:
                    parts.append({"text": verse_text[last_idx:start]})
                parts.append({"highlight": verse_text[start:end]})
                last_idx = end
            if last_idx < len(verse_text):
                parts.append({"text": verse_text[last_idx:]})

            row["verse"] = parts
        else:
            row["verse"] = [{"text": row["verse"]}]

    response = render(
        request,
        "index.html",
        build_context(
            rows=rows,
            version_name=version_name,
            version_exp=version_exp,
            version_wiki=version_wiki,
            input_words=input_words,
            selected_books=selected_books,
            case_sensitive=case_sensitive,
            keywords=highlight_words,
            generated_sql=generated_sql,
        ),
    )

    return response


def search_ajax(request):
    keyword = request.GET.get("search", "")
    version = request.GET.get("version", "ESV")
    case = request.GET.get("case", "False") == "True"
    books_param = request.GET.get("books", "")

    bits = f"{int(books_param):066b}"[::-1]
    selected_books = " ".join(f"{i:02}" for i, bit in enumerate(bits) if bit == "1")

    version_exp, version_wiki = find_version(version)
    
    highlight_context = {}
    raw_rows = sort_rows(sql_row_gen(keyword, version, case, highlight_context))
    highlight_words = highlight_context.get("words", [])
    generated_sql = highlight_context.get("generated_sql", None)

    rows = []
    for row in raw_rows:
        if f"{row['Book']:02}" in selected_books:
             book_text = next(b for b in books if b["id"] == row["Book"])["text"]
             rows.append(
                 {
                     "Book": book_text,
                     "Chapter": row["Chapter"],
                     "Versecount": row["Versecount"],
                     "verse": row["verse"],
                 }
             )

    for row in rows:
        if highlight_words:
            regex = "|".join(f"\\b{re.escape(word)}\\b" for word in highlight_words)
            verse_text = row["verse"]
            matches = list(
                re.finditer(regex, verse_text, flags=0 if case else re.IGNORECASE)
            )
            parts = []
            last_idx = 0
            for match in matches:
                start, end = match.span()
                if start > last_idx:
                    parts.append({"text": verse_text[last_idx:start]})
                parts.append({"highlight": verse_text[start:end]})
                last_idx = end
            if last_idx < len(verse_text):
                parts.append({"text": verse_text[last_idx:]})
            row["verse"] = parts
        else:
            row["verse"] = [{"text": row["verse"]}]

    return JsonResponse({"results": rows, "generated_sql": generated_sql})


def explain(request):
    """
    Generate an AI explanation for a specific verse.
    GET params: ref (e.g. 'John 3:16'), text (verse content)
    """
    ref = request.GET.get("ref", "")
    text = request.GET.get("text", "")
    
    if not ref or not text:
        return JsonResponse({"error": "Missing reference or text"}, status=400)
        
    explanation, error = explain_verse(ref, text)
    
    if error:
        return JsonResponse({"error": error}, status=500)
        
    return JsonResponse({"explanation": explanation})


def chapter_text(request):
    """
    Fetch the full text of a chapter.
    GET params: book, chapter, version
    """
    book = request.GET.get("book")
    chapter = request.GET.get("chapter")
    version = request.GET.get("version", "ESV") # Default to ESV if not specified
    
    if not book or not chapter:
        return JsonResponse({"error": "Missing book or chapter"}, status=400)
    
    # 1. Resolve Book ID
    # Frontend sends "Genesis", DB needs 1
    # We need to import get_book_id if not imported, or use lookup logic
    # It is in .bibledata potentially not imported in views.py scope explicitly as a function?
    # Checked imports: "from .bibledata import ( ... )" - need to add get_book_id to imports
    # But for now, let's just use the books list which IS imported
    book_id = None
    for b in books:
        if b["text"] == book:
            book_id = b["id"]
            break
            
    if book_id is None:
         # Fallback: maybe it IS passed as ID?
         if str(book).isdigit():
             book_id = int(book)
         else:
             return JsonResponse({"error": f"Invalid book: {book}"}, status=400)

    # 2. Resolve DB Path
    # Each version has its own DB: matches {Version}Bible_Database.db pattern
    valid_versions = ["ESV", "KJV", "ASV", "YLT", "WEB", "BBE", "DARBY", "WBT", "DRA", "NKJV", "NASB", "AMP", "RSV", "NIV"]
    if version not in valid_versions:
         version = "ESV"
         
    # Path is relative to project root usually
    import os
    db_path = os.path.join("databases", f"{version}Bible_Database.db")
    
    if not os.path.exists(db_path):
         # Try backup or default
         db_path = os.path.join("databases", "ESVBible_Database.db")

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 3. Query (Schema: Book INT, Chapter INT, Versecount INT, verse TEXT)
        query = "SELECT Versecount, verse as text FROM bible WHERE Book = ? AND Chapter = ? ORDER BY Versecount ASC"
        cursor.execute(query, (book_id, chapter))
        rows = cursor.fetchall()
        
        verses = []
        for row in rows:
            verses.append({
                "verse": row["Versecount"],
                "text": row["text"]
            })
            
        conn.close()
            
        return JsonResponse({
            "book": book,
            "chapter": chapter,
            "version": version,
            "verses": verses
        })
    except Exception as e:
         return JsonResponse({"error": str(e)}, status=500)