from django.test import TestCase
from unittest.mock import patch, MagicMock, ANY
from searchapp.llm_interface import detect_intent, generate_search_expression, validate_and_sanitize_sql

class IntentClassificationTests(TestCase):
    def test_detect_intent(self):
        """Test that intent detection defaults to LLM for parsing, but respects explicit syntax."""
        # Natural language (meta-data stripping needed) -> LLM
        self.assertEqual(detect_intent("verses about hope"), "LLM")
        self.assertEqual(detect_intent("show me verses on love"), "LLM")
        
        # Plain keywords -> LLM (to consistency handle parsing/stripping if needed)
        self.assertEqual(detect_intent("Jesus"), "LLM")
        self.assertEqual(detect_intent("love and mercy"), "LLM") 

        # Explicit Syntax -> STANDARD
        self.assertEqual(detect_intent("John 3:16"), "STANDARD")
        self.assertEqual(detect_intent("hope + love"), "STANDARD")
        
        # Explicit Prefixes trigger LLM
        self.assertEqual(detect_intent("ask: what does the bible say about love?"), "LLM")
        self.assertEqual(detect_intent("sql: verses about forgiveness"), "LLM")

class LLMGenerationTests(TestCase):
    @patch("searchapp.llm_interface.get_llm_client")
    def test_generate_expression_success(self, mock_get_client):
        # Mock OpenAI response
        mock_client = MagicMock()
        mock_completion = MagicMock()
        # Expect expansion now
        mock_completion.choices[0].message.content = "(hope, trust) + (love, charity)"
        mock_client.chat.completions.create.return_value = mock_completion
        # get_llm_client returns (client, provider)
        mock_get_client.return_value = (mock_client, "openai")

        expr, error = generate_search_expression("verses about love and hope")
        
        self.assertIsNone(error)
        self.assertEqual(expr, "(hope, trust) + (love, charity)")

    @patch("searchapp.llm_interface.get_llm_client")
    def test_generate_expression_deepseek(self, mock_get_client):
        # Mock DeepSeek response
        mock_client = MagicMock()
        mock_completion = MagicMock()
        mock_completion.choices[0].message.content = "grace + mercy"
        mock_client.chat.completions.create.return_value = mock_completion
        mock_get_client.return_value = (mock_client, "deepseek")

        expr, error = generate_search_expression("verses about grace")
        
        # Verify model selection
        mock_client.chat.completions.create.assert_called_with(
            model="deepseek-chat",
            messages=ANY,
            temperature=0,
            max_tokens=60
        )
        self.assertEqual(expr, "grace + mercy")

    @patch("searchapp.llm_interface.get_llm_client")
    def test_generate_expression_markdown_strip(self, mock_get_client):
        # Mock OpenAI response with markdown
        mock_client = MagicMock()
        mock_completion = MagicMock()
        mock_completion.choices[0].message.content = "```\nlove + hope\n```"
        mock_client.chat.completions.create.return_value = mock_completion
        mock_get_client.return_value = (mock_client, "openai")

        expr, error = generate_search_expression("verses about love and hope")
        
        self.assertEqual(expr, "love + hope")

class SQLValidationTests(TestCase):
    def test_safe_sql(self):
        self.assertTrue(validate_and_sanitize_sql("SELECT * FROM bible"))
        self.assertTrue(validate_and_sanitize_sql("SELECT * FROM bible WHERE verse LIKE '%test%'"))

    def test_unsafe_sql(self):
        self.assertFalse(validate_and_sanitize_sql("DROP TABLE bible"))
        self.assertFalse(validate_and_sanitize_sql("DELETE FROM bible"))
        self.assertFalse(validate_and_sanitize_sql("SELECT * FROM bible; DROP TABLE bible"))
