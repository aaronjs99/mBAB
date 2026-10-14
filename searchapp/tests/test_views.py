from unittest.mock import patch

from django.test import TestCase, override_settings

from searchapp.search import SearchOutcome


@override_settings(
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    }
)
class SearchEndpointTests(TestCase):
    @patch("searchapp.views.search_service.search", return_value=SearchOutcome((), "grace"))
    def test_ajax_accepts_current_search_parameter(self, search):
        response = self.client.get("/ajax/search/", {"search": "grace"})
        self.assertEqual(response.status_code, 200)
        search.assert_called_once()

    @patch("searchapp.views.search_service.search", return_value=SearchOutcome((), "grace"))
    def test_ajax_accepts_legacy_keyword_parameter(self, search):
        response = self.client.get("/ajax/search/", {"keyword": "grace"})
        self.assertEqual(response.status_code, 200)
        search.assert_called_once()

    def test_ajax_rejects_empty_queries(self):
        response = self.client.get("/ajax/search/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Enter a search query.")

    def test_home_renders_contract_catalog(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "BSB - Berean Standard Bible")
        self.assertContains(response, "Revelation")
        content = response.content.decode()
        self.assertIn(
            'type="module" src="/static/searchapp/scripts/search/app.js"', content
        )
        self.assertNotContains(response, "cdn.tailwindcss.com")
        self.assertNotContains(response, "onclick=")
