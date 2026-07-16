# Use Bash for Git Bash compatibility
SHELL := /bin/bash

.PHONY: run migrate makemigrations createsuperuser collectstatic install venv check test clean sites-install sites-dev sites-test

# Create virtual environment
venv:
	python -m venv venv

# Install dependencies (assumes venv is activated manually)
install:
	pip install -r requirements.txt

# Run the Django development server (default: 127.0.0.1:8000; override with HOST and PORT)
run:
	python manage.py runserver $${HOST:-127.0.0.1}:$${PORT:-8000}

# Run database migrations
migrate:
	python manage.py migrate

check:
	python manage.py check

test:
	python manage.py test

# Create new migrations
makemigrations:
	python manage.py makemigrations

# Collect static files into STATIC_ROOT
collectstatic:
	python manage.py collectstatic --noinput

# Create a superuser
createsuperuser:
	python manage.py createsuperuser

# Clean up compiled Python files
clean:
	-find . -name '*.pyc' -exec rm -f {} +
	-find . -name '__pycache__' -exec rm -rf {} +
	rm -rf staticfiles sites/dist sites/.vinext sites/.wrangler

sites-install:
	npm --prefix sites ci

sites-dev:
	npm --prefix sites run dev

sites-test:
	npm --prefix sites test
