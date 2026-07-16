"""Root URL configuration for mBAB."""

from django.urls import include, path

urlpatterns = [
    path("", include("searchapp.urls")),
]
