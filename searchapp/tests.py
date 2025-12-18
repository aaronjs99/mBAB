from django.test import TestCase
from searchapp.views import tokenize_expr, to_postfix, build_sql_from_postfix

class SearchLogicTests(TestCase):
    def test_tokenize_simple(self):
        expr = "love + hope"
        tokens = tokenize_expr(expr)
        self.assertEqual(tokens, ["love", "+", "hope"])

    def test_tokenize_complex(self):
        expr = "(love + hope) , faith"
        tokens = tokenize_expr(expr)
        self.assertEqual(tokens, ["(", "love", "+", "hope", ")", ",", "faith"])

    def test_postfix_precedence(self):
        # A + B , C -> A B + C ,
        tokens = ["A", "+", "B", ",", "C"]
        postfix = to_postfix(tokens)
        self.assertEqual(postfix, ["A", "B", "+", "C", ","])

    def test_postfix_parentheses(self):
        # A + (B , C) -> A B C , +
        tokens = ["A", "+", "(", "B", ",", "C", ")"]
        postfix = to_postfix(tokens)
        self.assertEqual(postfix, ["A", "B", "C", ",", "+"])

    def test_sql_generation_simple(self):
        postfix = ["love"]
        sql, params = build_sql_from_postfix(postfix)
        self.assertEqual(sql, "verse REGEXP ?")
        self.assertEqual(params, ["\\blove\\b"])

    def test_sql_generation_and(self):
        postfix = ["love", "hope", "+"]
        sql, params = build_sql_from_postfix(postfix)
        self.assertEqual(sql, "(verse REGEXP ? AND verse REGEXP ?)")
        self.assertEqual(params, ["\\blove\\b", "\\bhope\\b"])

    def test_sql_generation_or(self):
        postfix = ["love", "hope", ","]
        sql, params = build_sql_from_postfix(postfix)
        self.assertEqual(sql, "(verse REGEXP ? OR verse REGEXP ?)")
        self.assertEqual(params, ["\\blove\\b", "\\bhope\\b"])

    def test_regexp_check(self):
        from searchapp.views import regexp_check
        # Case insensitive by default
        self.assertTrue(regexp_check(r"\bgrace\b", "Amazing Grace"))
        self.assertTrue(regexp_check(r"\bgrace\b", "grace"))
        # Should NOT match substring without word boundary logic
        self.assertFalse(regexp_check(r"\bgrace\b", "disgrace"))
        self.assertFalse(regexp_check(r"\bgrace\b", "graceless"))
        # Multiple words in string
        self.assertTrue(regexp_check(r"\bgrace\b", "State of grace"))

    def test_parse_reference(self):
        from searchapp.bibledata import parse_verse_reference
        
        # Test Book Chapter:Verse
        ref = parse_verse_reference("John 3:16")
        self.assertIsNotNone(ref)
        self.assertEqual(ref["book_id"], 42) # John is 43rd book, index 42
        self.assertEqual(ref["chapter"], 3)
        self.assertEqual(ref["start_verse"], 16)
        self.assertEqual(ref["end_verse"], 16)

        # Test Book Chapter:Verse-Verse
        ref = parse_verse_reference("John 3:16-21")
        self.assertIsNotNone(ref)
        self.assertEqual(ref["start_verse"], 16)
        self.assertEqual(ref["end_verse"], 21)

        # Test Book Chapter
        ref = parse_verse_reference("John 3")
        self.assertIsNotNone(ref)
        self.assertEqual(ref["chapter"], 3)
        self.assertIsNone(ref["start_verse"])
        
        # Test Invalid
        ref = parse_verse_reference("NotABook 1:1")
        self.assertIsNone(ref)
