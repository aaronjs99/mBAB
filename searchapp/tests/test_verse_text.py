"""Source annotations stay out of verse searches and reading text."""

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase

from searchapp.query import compile_query
from searchapp.repository import BibleRepository


class VerseTextTests(SimpleTestCase):
    def setUp(self):
        directory = TemporaryDirectory(prefix="mbab-verse-text-")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        path = Path(__file__).resolve().parents[2] / "contracts/verse-text-fixtures.json"
        self.fixtures = json.loads(path.read_text(encoding="utf-8"))
        for version in {item["version"] for item in self.fixtures}:
            with closing(sqlite3.connect(self.root / f"{version}.db")) as database:
                database.execute("CREATE TABLE bible (Book INTEGER, Chapter INTEGER, Versecount INTEGER, verse TEXT)")
                database.executemany("INSERT INTO bible VALUES (?, ?, ?, ?)", [
                    (item["bookId"], item["chapter"], item["verse"], item["raw"])
                    for item in self.fixtures if item["version"] == version
                ])
                database.commit()

    def repository(self, version):
        return BibleRepository(version, path_resolver=lambda code: self.root / f"{code}.db")

    def test_reading_preserves_verse_words_without_web_notes_or_quote_escapes(self):
        for item in self.fixtures:
            with self.subTest(version=item["version"], verse=item["verse"]):
                chapter = self.repository(item["version"]).chapter(item["bookId"], item["chapter"])
                verses = {row["verse"]: row["text"] for row in chapter}
                if item["expected"]:
                    self.assertEqual(verses[item["verse"]], item["expected"])
                else:
                    self.assertNotIn(item["verse"], verses)

    def test_note_words_never_create_search_matches(self):
        repository = self.repository("WEB")
        self.assertEqual(repository.search(compile_query("Greek,Yehoshua")), [])
        results = repository.search(compile_query("Jesus"))
        self.assertEqual([row["Versecount"] for row in results], [1, 16])
        self.assertEqual(results[1]["verse"], self.fixtures[1]["expected"])

    def test_original_source_text_is_unchanged(self):
        self.repository("WEB").chapter(39, 1)
        with closing(sqlite3.connect(self.root / "WEB.db")) as database:
            row = database.execute("SELECT verse FROM bible WHERE Book=39 AND Chapter=1 AND Versecount=16").fetchone()
        self.assertEqual(row[0], self.fixtures[1]["raw"])
