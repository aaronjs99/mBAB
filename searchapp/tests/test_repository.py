import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from searchapp.query import compile_query
from searchapp.repository import BibleRepository, regexp_matches


class RepositoryTests(SimpleTestCase):
    def test_regexp_match_respects_boundaries_and_case(self):
        self.assertTrue(regexp_matches(r"\bgrace\b", "Amazing Grace"))
        self.assertFalse(regexp_matches(r"\bgrace\b", "Amazing Grace", True))
        self.assertFalse(regexp_matches(r"\bgrace\b", "disgrace"))

    def test_missing_database_has_clear_error(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = BibleRepository(
                "KJV", path_resolver=lambda _: Path(directory) / "missing.db"
            )
            with self.assertRaisesRegex(FileNotFoundError, "KJV Bible database"):
                repository.search(compile_query("grace"))
