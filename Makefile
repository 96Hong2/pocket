.PHONY: dev-front dev-back test lint check e2e

dev-front:
	cd frontend && npm run dev

dev-back:
	cd backend && ALLOW_UNVERIFIED_ANON_KEY=true uv run uvicorn app.main:app --reload

test:
	cd frontend && npm test
	cd backend && uv run pytest -q

lint:
	cd frontend && npx oxlint src
	cd backend && uv run ruff check . && uv run ruff format --check .

check: lint test
	cd frontend && npm run typecheck && npx vite build
	cd backend && uv run mypy app

e2e:
	cd frontend && npx playwright test
