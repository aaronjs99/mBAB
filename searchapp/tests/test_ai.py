from unittest.mock import ANY, MagicMock, patch

from django.test import SimpleTestCase

from searchapp.ai import generate_search_expression


class AiGenerationTests(SimpleTestCase):
    @patch("searchapp.ai.get_llm_client")
    def test_generate_expression_success(self, get_client):
        client = MagicMock()
        client.chat.completions.create.return_value.choices[0].message.content = "love + hope"
        get_client.return_value = (client, "openai")
        expression, error = generate_search_expression("verses about love and hope")
        self.assertEqual(expression, "love + hope")
        self.assertIsNone(error)

    @patch("searchapp.ai.get_llm_client")
    def test_provider_model_selection_and_markdown_cleanup(self, get_client):
        client = MagicMock()
        client.chat.completions.create.return_value.choices[0].message.content = "```\ngrace + mercy\n```"
        get_client.return_value = (client, "deepseek")
        expression, _ = generate_search_expression("verses about grace")
        client.chat.completions.create.assert_called_with(
            model="deepseek-chat", messages=ANY, temperature=0, max_tokens=60
        )
        self.assertEqual(expression, "grace + mercy")
