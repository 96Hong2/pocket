# 명령의 정본은 frontend/package.json 의 scripts 다. 여기서는 그걸 부르기만 한다.
# Makefile 이 스스로 갖는 것은 도커와 alembic 오케스트레이션뿐이다.

# 개발 스택과 e2e 스택은 같은 컨테이너 안의 서로 다른 DB 를 본다.
DEV_DATABASE_URL ?= postgresql+psycopg://pocket:pocket@localhost:5434/pocket
E2E_DATABASE_URL ?= postgresql+psycopg://pocket:pocket@localhost:5434/pocket_e2e

.PHONY: dev-front dev-back test lint check e2e e2e-edge \
        docker-check db-up db-down db-reset db-psql migrate-dev migrate-e2e migrate \
        image image-run

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

# 엣지케이스는 기본 검증에 안 섞는다. 출시 전과 크게 고친 뒤에만 돌린다.
# 같은 포트를 쓰므로 위 e2e 와 동시에 돌릴 수 없다.
e2e-edge: migrate-e2e
	cd frontend && npm run e2e:edge

## ── 운영 이미지 ─────────────────────────────────

# 빌드 맥락은 backend/ 다. Dockerfile 은 그 밖에 있어 -f 로 가리킨다.
image: docker-check
	docker build -f docker/backend/Dockerfile -t pocket-backend:local backend

# 만든 이미지를 로컬 DB 에 붙여 한 번 띄워 본다. Cloud Run 에 올리기 전 마지막 확인이다.
# host.docker.internal 은 컨테이너 안에서 이 맥을 가리킨다.
image-run: image db-up
	docker run --rm -p 8080:8080 \
		-e ENVIRONMENT=local \
		-e ALLOW_UNVERIFIED_ANON_KEY=true \
		-e DATABASE_URL='postgresql+psycopg://pocket:pocket@host.docker.internal:5434/pocket' \
		pocket-backend:local
