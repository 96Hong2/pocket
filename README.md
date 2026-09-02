# pocket

앱인토스(Apps in Toss) 미니앱 가계부. 10초 만에 기록하고, 저장하는 순간 지금 돈 상태를 알려준다.

```
frontend/   React 19 + TypeScript + Vite. 앱인토스 WebView SDK 3.2.0
backend/    FastAPI + SQLAlchemy 2 + Alembic. PostgreSQL
docs/       아키텍처 · 데이터 모델 · API 계약 · 설계 결정 기록
```

프론트는 백엔드만 부른다. DB나 토스 서버 API를 직접 부르지 않는다.
앱인토스 SDK는 `frontend/src/shared/toss/` 한 곳에서만 호출한다.
돈 계산은 전부 `backend/app/domain/` 의 순수 함수가 한다.

## 시작하기

### 프론트

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

브라우저에서도 앱 전체가 돈다. `@apps-in-toss/devtools` 가 목 SDK를 넣어 준다.
실기기 확인은 `npm run build` 로 `pocket.ait` 를 만들어 콘솔에 올린다.

### 백엔드

PostgreSQL이 필요하다.

```bash
cd backend
uv sync
cp .env.example .env               # DATABASE_URL 을 자기 것으로
uv run alembic upgrade head
ALLOW_UNVERIFIED_ANON_KEY=true uv run uvicorn app.main:app --reload
```

`ALLOW_UNVERIFIED_ANON_KEY=true` 없이는 기동이 실패한다.
익명 식별키를 검증할 mTLS 인증서가 아직 없어서, 검증을 건너뛰겠다고 명시해야 뜨도록 막아 뒀다.
운영 환경에서는 이 값을 켤 수 없다.

## 검사

```bash
make check     # 린트 · 타입 · 테스트 · 빌드 전부
make test      # 테스트만
make e2e       # 브라우저 스모크
```

## 문서

| 무엇 | 어디 |
| --- | --- |
| 작업 규칙 | [CLAUDE.md](CLAUDE.md), [AI_DEV_RULES.md](AI_DEV_RULES.md) |
| 레이어와 경계 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 엔티티와 필드 | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| 엔드포인트 | [docs/API_CONTRACT.md](docs/API_CONTRACT.md) |
| 설치된 실제 버전 | [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) |
| 왜 그렇게 정했나 | [docs/ADR/](docs/ADR/) |
| 비밀값 넣는 법 | [docs/SECRETS.md](docs/SECRETS.md) |

제품 요구사항(PRD)은 이 저장소에 없다. 개인 볼트에 따로 둔다.

## 아직 연결하지 못한 것

- mTLS 클라이언트 인증서 (익명 식별키 서버 검증)
- 운영 광고 그룹 ID (지금은 공식 테스트 ID)
- LLM API 키 (지금은 규칙 기반 스텁)

셋 다 어댑터와 설정 자리는 있다. [docs/SECRETS.md](docs/SECRETS.md) 참고.
