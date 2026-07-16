from django.test import SimpleTestCase

from searchapp.catalog import (
    ALL_BOOK_MASK,
    BOOKS,
    BOOK_GROUPS,
    BOOK_SECTIONS,
    DEFAULT_VERSION,
    VERSIONS,
    normalize_version,
)


class CatalogTests(SimpleTestCase):
    def test_contract_exposes_complete_canonical_catalog(self):
        self.assertEqual([book.id for book in BOOKS], list(range(66)))
        self.assertEqual(len(VERSIONS), 11)
        self.assertEqual(DEFAULT_VERSION, "KJV")
        self.assertEqual(ALL_BOOK_MASK, (1 << 66) - 1)

    def test_normalize_version_is_case_tolerant_and_safe(self):
        self.assertEqual(normalize_version("bsb"), "BSB")
        self.assertEqual(normalize_version("NOT-A-VERSION"), "KJV")

    def test_groups_and_sections_reference_known_books(self):
        ids = {book.id for book in BOOKS}
        for collection in (*BOOK_GROUPS, *BOOK_SECTIONS):
            self.assertTrue(set(collection.book_ids).issubset(ids))
        self.assertEqual(sum(len(section.book_ids) for section in BOOK_SECTIONS), 66)
