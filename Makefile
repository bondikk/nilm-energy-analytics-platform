.PHONY: setup up down test lint frontend frontend-build

PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/python -m pytest
RUFF := $(VENV)/bin/python -m ruff
MYPY := $(VENV)/bin/python -m mypy

setup:
	@test -f .env || cp .env.example .env
	@test -d $(VENV) || $(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -e "./backend[dev]"
	cd frontend && npm install

up:
	docker compose up -d --build

down:
	docker compose down

test:
	PYTHONPATH=backend $(PYTEST) -q
	cd frontend && npm run typecheck

lint:
	PYTHONPATH=backend $(RUFF) check backend tests
	cd backend && ../$(MYPY) app

frontend:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build
