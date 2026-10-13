"""Repository operations release their real SQLite connections promptly."""

import sqlite3
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase

from searchapp.query import CompiledQuery, compile_query
from searchapp.repository import BibleRepository


class TrackingBibleRepository(BibleRepository):
    def __init__(self, corpus_path):
        super().__init__("KJV", path_resolver=lambda version: corpus_path)
        self.connections = []

    def _connect(self):
        connection = super()._connect()
        self.connections.append(connection)
        return connection


class ConnectionLifecycleTests(SimpleTestCase):
    def setUp(self):
        directory = TemporaryDirectory(prefix="mbab-connection-lifecycle-")
        self.addCleanup(directory.cleanup)
        self.corpus_path = Path(directory.name) / "corpus.db"
        with closing(sqlite3.connect(self.corpus_path)) as database:
            database.execute(
                "CREATE TABLE bible (Book INTEGER, Chapter INTEGER, "
                "Versecount INTEGER, verse TEXT)"
            )
            database.executemany(
                "INSERT INTO bible VALUES (?, ?, ?, ?)",
                [
                    (42, 3, 17, "God saves"),
                    (0, 1, 1, "In the beginning"),
                    (42, 3, 16, "God is love"),
                ],
            )
            database.commit()
        self.repository = TrackingBibleRepository(self.corpus_path)
        self.addCleanup(self.close_connections)

    def close_connections(self):
        for connection in self.repository.connections:
            connection.close()

    def assert_connections_closed(self):
        self.assertTrue(self.repository.connections)
        for connection in self.repository.connections:
            with self.assertRaises(sqlite3.ProgrammingError):
                connection.execute("SELECT 1")

    def test_search_closes_connection_after_returning_ordered_results(self):
        rows = self.repository.search(compile_query("God"))

        self.assertEqual(
            rows,
            [
                {"Book": 42, "Chapter": 3, "Versecount": 16, "verse": "God is love"},
                {"Book": 42, "Chapter": 3, "Versecount": 17, "verse": "God saves"},
            ],
        )
        self.assert_connections_closed()

    def test_chapter_closes_connection_after_returning_ordered_results(self):
        rows = self.repository.chapter(42, 3)

        self.assertEqual(
            rows,
            [{"verse": 16, "text": "God is love"}, {"verse": 17, "text": "God saves"}],
        )
        self.assert_connections_closed()

    def test_search_closes_connection_when_sql_execution_fails(self):
        with self.assertRaises(sqlite3.OperationalError):
            self.repository.search(CompiledQuery("missing_column = ?", (1,)))

        self.assert_connections_closed()

    def test_chapter_closes_connection_when_sql_execution_fails(self):
        with closing(sqlite3.connect(self.corpus_path)) as database:
            database.execute("DROP TABLE bible")
            database.commit()

        with self.assertRaises(sqlite3.OperationalError):
            self.repository.chapter(42, 3)

        self.assert_connections_closed()
