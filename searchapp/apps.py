from django.apps import AppConfig
import os


class SearchappConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "searchapp"
    path = os.path.dirname(os.path.abspath(__file__))
