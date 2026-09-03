# 명령의 정본은 frontend/package.json 의 scripts 다. 여기서는 그걸 부르기만 한다.
# Makefile 이 스스로 갖는 것은 도커와 alembic 오케스트레이션뿐이다.

# 개발 스택과 e2e 스택은 같은 컨테이너 안의 서로 다른 DB 를 본다.
DEV_DATABASE_URL ?= postgresql+psycopg://pocket:pocket@localhost:5434/pocket
E2E_DATABASE_URL ?= postgresql+psycopg://pocket:pocket@localhost:5434/pocket_e2e

.PHONY: dev-front dev-back test lint check e2e \
        docker-check db-up db-down db-reset db-psql migrate-dev migrate-e2e migrate

## ── 개발 서버 ───────────────────────────────────

dev-front:
	cd frontend && npm run dev

dev-back: db-up
	cd backend && ENVIRONMENT=local ALLOW_UNVERIFIED_ANON_KEY=true \
		DATABASE_URL=$(DEV_DATABASE_URL) \
		uv run uvicorn app.main:app --reload

## ── 로컬 DB ────────────────────────────────────

# Docker Desktop 이 꺼져 있으면 compose 가 소켓 오류만 뱉는다. 먼저 걸러서 알려 준다.
docker-check:
	@docker info >/dev/null 2>&1 || { \
		echo "Docker 가 응답하지 않는다. Docker Desktop 을 켜고 다시 실행한다."; \
		exit 1; \
	}

db-up: docker-check
	docker compose up -d --wait db

db-down:
	docker compose stop db

# 데이터를 지운다. initdb 스크립트를 고쳤을 때만 필요하다.
# initdb 는 볼륨이 빈 첫 기동에만 돌기 때문에 볼륨을 지우지 않으면 반영되지 않는다.
db-reset: docker-check
	docker compose down --volumes
	$(MAKE) db-up
	$(MAKE) migrate

db-psql:
	docker exec -it pocket-db psql -U pocket -d pocket

## ── 마이그레이션 ────────────────────────────────

migrate-dev: db-up
	cd backend && DATABASE_URL=$(DEV_DATABASE_URL) uv run alembic upgrade head

migrate-e2e: db-up
	cd backend && DATABASE_URL=$(E2E_DATABASE_URL) uv run alembic upgrade head

migrate: migrate-dev migrate-e2e

## ── 검사 ───────────────────────────────────────

test:
	cd frontend && npm test
	cd backend && ALLOW_UNVERIFIED_ANON_KEY=true uv run pytest -q

lint:
	cd frontend && npm run lint
	cd backend && uv run ruff check . && uv run ruff format --check .

check: lint test
	cd frontend && npm run typecheck && npm run build:web
	cd backend && uv run mypy app

# e2e 는 자기 포트와 pocket_e2e DB 를 쓴다. 개발 스택(5173·8000·pocket)과 겹치지 않는다.
e2e: migrate-e2e
	cd frontend && npm run e2e
