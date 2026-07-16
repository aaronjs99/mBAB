"""Root URL configuration for mBAB."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("searchapp.urls")),
]
