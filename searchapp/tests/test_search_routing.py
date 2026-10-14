"""Search routing regressions against a small, independent SQLite corpus."""

import sqlite3
from contextlib import closing
from functools import partial
from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase

from searchapp.repository import BibleRepository
from searchapp.search import SearchRequest, SearchService


class SearchRoutingTests(SimpleTestCase):
    def setUp(self):
        directory = TemporaryDirectory(prefix="mbab-search-routing-")
        self.addCleanup(directory.cleanup)
        corpus_path = Path(directory.name) / "corpus.db"
        with closing(sqlite3.connect(corpus_path)) as database:
            database.execute(
                "CREATE TABLE bible (Book INTEGER, Chapter INTEGER, "
                "Versecount INTEGER, verse TEXT)"
            )
            database.executemany(
                "INSERT INTO bible VALUES (?, ?, ?, ?)",
                [
                    (0, 1, 1, "Love mercy"),
                    (42, 3, 16, "love mercy"),
                    (42, 3, 17, "love"),
                    (42, 3, 18, "hope works"),
                    (44, 5, 1, "hope"),
                    (65, 1, 1, "mercy works"),
                    (65, 1, 2, "beloved"),
                ],
            )
            database.commit()
        self.repository_factory = partial(
            BibleRepository, path_resolver=lambda version: corpus_path
        )
        self.deterministic_service = SearchService(
            repository_factory=self.repository_factory,
            expression_generator=self.unexpected_provider,
        )

    def unexpected_provider(self, expression, version):
        self.fail(f"Deterministic query reached the optional provider: {expression!r}")

    @staticmethod
    def references(outcome):
        return [
            f"{result.book} {result.chapter}:{result.verse_number}"
            for result in outcome.results
        ]

    def test_single_keyword_bypasses_provider_and_matches_whole_words(self):
        outcome = self.deterministic_service.search(SearchRequest("love"))

        self.assertEqual(
            self.references(outcome),
            ["Genesis 1:1", "John 3:16", "John 3:17"],
        )
        self.assertEqual(outcome.evaluated_expression, "love")
        self.assertIsNone(outcome.generated_expression)

    def test_single_keyword_keeps_case_and_book_scope(self):
        for query, case_sensitive, book_ids, expected in [
            ("Love", True, frozenset({0, 42}), ["Genesis 1:1"]),
            ("love", True, frozenset({42}), ["John 3:16", "John 3:17"]),
            ("LOVE", False, frozenset({42}), ["John 3:16", "John 3:17"]),
        ]:
            with self.subTest(query=query, case_sensitive=case_sensitive):
                outcome = self.deterministic_service.search(
                    SearchRequest(query, case_sensitive=case_sensitive, book_ids=book_ids)
                )
                self.assertEqual(self.references(outcome), expected)
                self.assertIsNone(outcome.generated_expression)

    def test_textual_boolean_search_bypasses_provider_with_existing_precedence(self):
        for query, expected in [
            ("love OR mercy", ["Genesis 1:1", "John 3:16", "John 3:17", "Revelation 1:1"]),
            ("love and mercy", ["Genesis 1:1", "John 3:16"]),
            ("love OR hope AND works", ["Genesis 1:1", "John 3:16", "John 3:17", "John 3:18"]),
        ]:
            with self.subTest(query=query):
                outcome = self.deterministic_service.search(SearchRequest(query))
                self.assertEqual(self.references(outcome), expected)
                self.assertEqual(outcome.evaluated_expression, query)
                self.assertIsNone(outcome.generated_expression)

    def test_symbolic_boolean_and_references_stay_deterministic(self):
        for query, expected in [
            ("(love+mercy),hope", ["Genesis 1:1", "John 3:16", "John 3:18", "Romans 5:1"]),
            ("John 3:16-18", ["John 3:16", "John 3:17", "John 3:18"]),
        ]:
            with self.subTest(query=query):
                outcome = self.deterministic_service.search(SearchRequest(query))
                self.assertEqual(self.references(outcome), expected)
                self.assertIsNone(outcome.generated_expression)

    def test_explicit_natural_prefixes_keep_optional_provider_behavior(self):
        for query in ["ask: love", "sql: love", "AsK: love+mercy", "SQL: (love OR mercy)"]:
            with self.subTest(query=query):
                service = SearchService(
                    repository_factory=self.repository_factory,
                    expression_generator=lambda expression, version: ("hope", None),
                )
                outcome = service.search(SearchRequest(query))
                self.assertEqual(self.references(outcome), ["John 3:18", "Romans 5:1"])
                self.assertEqual(outcome.generated_expression, "hope")

    def test_unprefixed_natural_sentence_keeps_optional_provider_behavior(self):
        service = SearchService(
            repository_factory=self.repository_factory,
            expression_generator=lambda expression, version: ("hope", None),
        )

        outcome = service.search(SearchRequest("show me verses about love and mercy"))

        self.assertEqual(self.references(outcome), ["John 3:18", "Romans 5:1"])
        self.assertEqual(outcome.generated_expression, "hope")

    def test_natural_requests_keep_deterministic_fallback_when_provider_is_absent(self):
        service = SearchService(
            repository_factory=self.repository_factory,
            expression_generator=lambda expression, version: (None, "offline"),
        )
        for query in ["show me verses about love and mercy", "ask: love+mercy", "sql: love+mercy"]:
            with self.subTest(query=query):
                outcome = service.search(SearchRequest(query))
                self.assertEqual(self.references(outcome), ["Genesis 1:1", "John 3:16"])
                self.assertEqual(outcome.evaluated_expression, "love+mercy")
                self.assertIsNone(outcome.generated_expression)
