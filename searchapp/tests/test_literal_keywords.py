"""Literal operator words and strict Boolean syntax through the real repository."""

import sqlite3
from contextlib import closing
from functools import partial
from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase

from searchapp.query import compile_query
from searchapp.repository import BibleRepository
from searchapp.search import SearchRequest, SearchService


class LiteralKeywordTests(SimpleTestCase):
    def setUp(self):
        directory = TemporaryDirectory(prefix="mbab-literal-keywords-")
        self.addCleanup(directory.cleanup)
        corpus = Path(directory.name) / "corpus.db"
        with closing(sqlite3.connect(corpus)) as database:
            database.execute("CREATE TABLE bible (Book INTEGER, Chapter INTEGER, Versecount INTEGER, verse TEXT)")
            database.executemany("INSERT INTO bible VALUES (?, ?, ?, ?)", [
                (0, 1, 1, "and grace"),
                (42, 1, 1, "love and mercy"),
                (42, 1, 2, "love or grace"),
                (42, 1, 3, "and or"),
                (42, 1, 4, "mercy only"),
            ])
            database.commit()
        self.service = SearchService(
            repository_factory=partial(BibleRepository, path_resolver=lambda version: corpus),
            expression_generator=lambda *args: self.fail("A Boolean query reached the optional provider"),
        )

    def search(self, expression, **kwargs):
        outcome = self.service.search(SearchRequest(expression, book_ids=frozenset({42}), **kwargs))
        self.assertIsNone(outcome.generated_expression)
        return [result.verse_number for result in outcome.results]

    def test_operator_words_are_literal_alone_and_beside_symbols(self):
        for expression, expected in [
            ("and", [1, 3]), ("or", [2, 3]), ("love+and", [1]),
            ("love,or", [1, 2, 3]), ("(and+or)", [3]), ("love+and+mercy", [1]),
        ]:
            with self.subTest(expression=expression):
                self.assertEqual(self.search(expression), expected)

    def test_textual_operators_work_between_words_or_groups(self):
        for expression, expected in [
            ("love AND mercy", [1]), ("love OR mercy", [1, 2, 4]),
            ("(love)OR(mercy)", [1, 2, 4]), ("and OR mercy", [1, 3, 4]),
        ]:
            with self.subTest(expression=expression):
                self.assertEqual(self.search(expression), expected)

    def test_literal_words_keep_case_scope_and_highlights(self):
        self.assertEqual(self.search("AND"), [1, 3])
        self.assertEqual(self.search("AND", case_sensitive=True), [])
        outcome = self.service.search(SearchRequest("and", book_ids=frozenset({0})))
        self.assertEqual([result.book for result in outcome.results], ["Genesis"])
        self.assertEqual(compile_query("love+and").highlight_terms, ("love", "and"))
        self.assertEqual(compile_query("love AND mercy").highlight_terms, ("love", "mercy"))

    def test_invalid_infix_expressions_never_compile_to_accidental_matches(self):
        for expression in ["love mercy+", "love mercy", "+love mercy", "love(mercy)", "()", "love+", "love OR OR mercy", "love!"]:
            with self.subTest(expression=expression), self.assertRaises(ValueError):
                compile_query(expression)

    def test_symbolic_invalid_searches_bypass_optional_provider_and_fail(self):
        with self.assertRaises(ValueError):
            self.service.search(SearchRequest("love mercy+"))
