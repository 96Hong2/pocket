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

### 로컬 DB

PostgreSQL 하나를 도커로 띄운다. 배포용이 아니라 개발과 검증에만 쓴다.

```bash
make db-up        # postgres:18-alpine 을 5434 에 띄운다
make migrate      # pocket 과 pocket_e2e 두 DB 에 스키마를 올린다
```

**개발 스택과 e2e 스택은 서로 다른 DB 를 본다.** 컨테이너는 하나고 DB 가 둘이다.

| | 프론트 | 백엔드 | DB |
| --- | --- | --- | --- |
| 개발 | 5173 | 8000 | `pocket` |
| e2e | 5183 | 8100 | `pocket_e2e` |

포트를 갈라 둔 이유는 하나다. 손으로 띄워 둔 개발 서버를 테스트가 주워 쓰면 개발 데이터에 테스트가 쓴다.

5434 를 쓰는 것도 이유가 있다. 이 맥에는 다른 프로젝트의 postgres 가 5432·5433 에 이미 떠 있다.
그 컨테이너는 우리 것이 아니니 건드리지 않는다.

`docker/initdb/` 스크립트는 **데이터 볼륨이 비어 있는 첫 기동에만** 돈다.
그 안을 고쳤다면 `make db-reset` 으로 볼륨을 지워야 반영된다. 데이터는 사라진다.

Docker Desktop 이 꺼져 있으면 `make` 가 먼저 알려 준다.

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
```

띄우는 것은 루트에서 한다. `make` 가 DB 를 먼저 확인하고 접속 주소를 넣어 준다.

```bash
make dev-back                      # http://localhost:8000, DB 는 pocket
```

`ALLOW_UNVERIFIED_ANON_KEY=true` 없이는 기동이 실패한다.
익명 식별키를 검증할 mTLS 인증서가 아직 없어서, 검증을 건너뛰겠다고 명시해야 뜨도록 막아 뒀다.
이 값은 `ENVIRONMENT=local` 에서만 켤 수 있다. dev 서버도 여러 사람이 붙는 공용 서버라 막아 뒀다.

### 손으로 만져 볼 데이터

빈 화면으로는 달력·리포트·예산 게이지를 볼 수 없다. 개발 스택에 한 번 심어 둔다.

```bash
python3 scripts/seed-dev.py            # 6개월치 268건 + 예산 + 내 분류
python3 scripts/seed-dev.py --wipe     # 있던 거래를 지우고 다시
python3 scripts/seed-dev.py --recovery # 최근 나흘을 비운다. 복구 카드가 뜬다
```

개발 도구의 목 익명키가 고정값이라 그 키로 넣는다. 브라우저를 새로고침하면 바로 보인다.
지출·수입·이체·환불·예산 제외·무지출일과 990원부터 백만원대까지를 섞어 둔다.

⚠ 개발용 DB(`pocket`)에만 넣는다. `make e2e` 가 쓰는 `pocket_e2e` 와 섞이지 않는다.

## 검사

```bash
make check     # 린트 · 타입 · 테스트 · 빌드 전부
make test      # 테스트만
make e2e       # 브라우저. DB 스키마를 올리고 자기 포트로 서버를 띄운다
make e2e-edge  # 가장자리만. 경계값·실패 주입·심사 항목. 출시 전과 크게 고친 뒤에만
```

`make e2e-edge` 는 매번 돌리지 않는다. `make e2e` 와 같은 포트를 쓰므로 **함께 돌릴 수 없다.**

`make e2e` 는 서버를 직접 띄운다. 이미 5183·8100 이 물려 있으면 남의 서버를 주워 쓰지 않고 그 자리에서 실패한다.
그때는 그 포트를 먼저 비운다. e2e 규약과 새 spec 을 만드는 순서는 [frontend/e2e/README.md](frontend/e2e/README.md) 에 있다.

명령의 정본은 `frontend/package.json` 의 scripts 다. Makefile·CI·`app-guard` 가 그걸 부른다.
브라우저 스모크는 앱인토스 개발 도구가 넣어 주는 목 SDK 위에서 돈다.
실기기와 같은 브릿지 코드가 돌지만, 배너 크기와 네이티브 권한은 여기서 확인되지 않는다.

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

발급이나 등록을 받아야 풀리는 것.

- mTLS 클라이언트 인증서 (익명 식별키 서버 검증)
- 운영 광고 그룹 ID (지금은 공식 테스트 ID)
- LLM API 키 (지금은 규칙 기반 스텁)

셋 다 어댑터와 설정 자리는 있다. [docs/SECRETS.md](docs/SECRETS.md) 참고.

## 배포

운영 이미지는 `docker/backend/Dockerfile` 이고 순서는 [docs/DEPLOY.md](docs/DEPLOY.md) 에 있다.
`compose.yaml` 은 로컬 DB 전용이라 배포와 무관하다.

운영 서버가 서기 전까지 실기기 테스트는 임시 공개 주소로 한다.
⚠ **그 서버는 익명 식별키를 검증하지 않는다**(인증서가 아직 없다). 주소를 아는 사람은
아무 키나 보내 남의 기록을 볼 수 있다. **테스트가 끝나면 끈다.** 자세한 것은 `docs/SECRETS.md` §3.

```bash
make serve-public                       # 백엔드를 잠깐 공개 주소로 연다
make ait API_BASE_URL=https://...       # 그 주소를 넣어 pocket.ait 를 만든다
```

콘솔에 올릴 것(로고·스크린샷·문안)은 [docs/store/](docs/store/) 에 있다.
