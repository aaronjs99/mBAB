# Use Bash for Git Bash compatibility
SHELL := /bin/bash

.PHONY: run migrate makemigrations createsuperuser collectstatic install venv clean

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