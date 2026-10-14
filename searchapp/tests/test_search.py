from django.test import SimpleTestCase

from searchapp.search import SearchRequest, SearchService, parse_book_mask


class FakeRepository:
    def __init__(self, version, *, case_sensitive=False):
        self.version = version
        self.case_sensitive = case_sensitive

    def search(self, query):
        return [
            {"Book": 42, "Chapter": 3, "Versecount": 16, "verse": "God is love"},
            {"Book": 44, "Chapter": 5, "Versecount": 1, "verse": "Therefore being justified by faith"},
        ]

    def chapter(self, book_id, chapter):
        return [{"verse": 1, "text": "In the beginning"}]


class SearchServiceTests(SimpleTestCase):
    def test_search_filters_books_and_highlights_terms(self):
        service = SearchService(
            repository_factory=FakeRepository,
            expression_generator=lambda query, version: ("love", None),
        )
        outcome = service.search(SearchRequest("love", book_ids=frozenset({42})))
        self.assertEqual(len(outcome.results), 1)
        self.assertEqual(outcome.results[0].book, "John")
        self.assertEqual(outcome.results[0].text_parts[1], {"highlight": "love"})

    def test_natural_query_falls_back_without_ai(self):
        service = SearchService(
            repository_factory=FakeRepository,
            expression_generator=lambda query, version: (None, "offline"),
        )
        outcome = service.search(SearchRequest("show me verses about faith"))
        self.assertEqual(outcome.evaluated_expression, "faith")
        self.assertIsNone(outcome.generated_expression)

    def test_book_mask_decoding(self):
        self.assertEqual(parse_book_mask(str((1 << 0) | (1 << 42))), {0, 42})
        with self.assertRaisesRegex(ValueError, "selected-book mask"):
            parse_book_mask("not-a-number")
