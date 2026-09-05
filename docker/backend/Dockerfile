# 백엔드 운영 이미지. Cloud Run 이 이걸 띄운다.
#
# 두 단으로 나눈다. 앞 단이 의존성을 설치하고 뒷 단은 그 결과만 가져온다.
# uv 와 빌드 도구가 최종 이미지에 남지 않아야 공격면이 줄고 이미지도 가벼워진다.
#
# 로컬 개발은 이 파일을 쓰지 않는다. `make dev-back` 이 호스트에서 직접 돈다.
# compose.yaml 은 DB 하나만 띄우는 것이고 이 이미지와 무관하다.

# ── 1단: 의존성 ────────────────────────────────────────────
FROM python:3.13-slim AS deps

# uv 는 공식 배포 이미지에서 실행 파일만 꺼내 온다. pip 로 설치하면 버전이 흔들린다.
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# 잠금 파일만 먼저 넣어 레이어를 나눈다. 소스만 바뀐 빌드는 설치를 건너뛴다.
COPY pyproject.toml uv.lock ./
# --frozen: 잠금 파일을 갱신하지 않는다. 운영 이미지가 개발자 로컬과 다른 버전을 쓰면 안 된다.
# --no-dev: pytest·mypy·ruff 는 운영에 넣지 않는다.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# ── 2단: 실행 ──────────────────────────────────────────────
FROM python:3.13-slim AS runtime

# tini 가 1번 프로세스를 맡아 SIGTERM 을 uvicorn 에 넘긴다.
# 없으면 Cloud Run 이 리비전을 걷어낼 때 진행 중인 요청이 잘린다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

# 루트로 돌리지 않는다. 컨테이너가 뚫려도 파일 시스템을 못 고치게 한다.
RUN useradd --create-home --uid 10001 pocket

WORKDIR /app
COPY --from=deps /app/.venv /app/.venv
COPY --chown=pocket:pocket . /app

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=prod

USER pocket

# Cloud Run 이 PORT 를 준다. 우리가 고른 값을 박으면 그 리비전은 트래픽을 못 받는다.
# 기본값 8080 은 로컬에서 `docker run` 으로 띄워 볼 때만 쓰인다.
ENV PORT=8080
EXPOSE 8080

# --proxy-headers: Cloud Run 앞단이 붙이는 X-Forwarded-* 를 믿는다.
#   안 켜면 클라이언트 주소가 전부 프록시 주소로 보인다.
# --workers 를 늘리지 않는다. Cloud Run 은 인스턴스를 늘려 확장한다.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
