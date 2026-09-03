# 10초 가계부 (pocket)

앱인토스 미니앱 가계부. 10초 만에 기록하고, 저장하는 순간 지금 돈 상태를 알려준다.
프론트는 WebView(React), 백엔드는 FastAPI, DB 는 PostgreSQL 이다.

작업 전에 `AI_DEV_RULES.md` 를 읽는다. 그게 상시 규칙이고 이 파일보다 자세하다.

## 절대 규칙

1. **앱인토스 SDK 를 화면에서 직접 부르지 않는다.** `frontend/src/shared/toss/` 브릿지만 통과한다.
2. **SDK/API 이름을 기억으로 지어내지 않는다.** 공식 문서가 낡아 있다.
   가장 정확한 것은 `frontend/node_modules/@apps-in-toss/web-framework/dist/index.d.ts` 다. → `.claude/skills/ait-docs`
3. **금액은 항상 양수로 저장**하고 의미는 `type`(지출·수입·이체·환불)이 구분한다.
4. **남은 예산 · 이번 달 차액 · 순자산을 하나로 합치지 않는다.** 서로 다른 개념이다.
5. **AI 가 숫자를 계산하지 않는다.** 파싱·분류·설명만 한다. 집계는 `backend/app/domain/` 이 한다.
6. **상단 네비게이션 바를 직접 그리지 않는다.** 플랫폼이 그린다. 설정은 `frontend/apps-in-toss.config.ts`.
7. **광고에 닫기(X) 버튼이나 자체 라벨을 넣지 않는다.** 배너를 우리가 새로고침하지 않는다. → ADR-0004
8. **OCR/LLM 원문과 계좌·카드번호를 저장하거나 로그에 남기지 않는다.**
9. **P2 를 선구현하지 않는다.** P1 은 모델·라우트 자리표시자까지다. 데이터 조회와 입력 UI 는 P1 착수 전에 만들지 않는다.
10. **최신 안정 버전만 쓴다.** beta·rc·canary 금지. 새 의존성은 추가 전에 근거를 남긴다.

## 어디를 봐야 하나

| 무엇 | 어디 |
| --- | --- |
| 제품 요구사항 | 레포에 없다. 레포 밖 개인 노트에 PRD v5 가 정본으로 있다(경로는 인계 문서) |
| 상시 개발 규칙 | `AI_DEV_RULES.md` |
| 레이어와 경계 | `docs/ARCHITECTURE.md` |
| 엔티티·필드 | `docs/DATA_MODEL.md` |
| 엔드포인트 | `docs/API_CONTRACT.md`, 정본은 `docs/openapi.json` |
| 설치된 실제 버전 | `docs/DEPENDENCIES.md` |
| 왜 그렇게 정했나 | `docs/ADR/` |
| 비밀값 넣는 법 | `docs/SECRETS.md` |
| 디자인 시안 | 레포에 없다. PRD 와 같은 자리에 있다 |
| 변경 전 자가점검 | `.claude/skills/app-guard` |
| 앱인토스 사실 확인 | `.claude/skills/ait-docs` |

## 명령

`frontend/package.json` 의 scripts 가 명령의 정본이다. Makefile·CI·app-guard 도 이걸 쓴다.

```bash
# 프론트
cd frontend
npm run dev            # vite dev (브라우저에서 공식 목 SDK 로 동작)
npm run typecheck      # tsc -b
npm run lint           # oxlint src tests e2e
npm test               # vitest
npm run build:web      # tsc -b && vite build   (CI 가 도는 것)
npm run build          # build:web && ait build → pocket.ait  (배포용)

# 백엔드
cd backend
uv run uvicorn app.main:app --reload
ALLOW_UNVERIFIED_ANON_KEY=true uv run pytest -q   # 인증서가 없으면 수집 단계에서 죽는다
uv run ruff check . && uv run ruff format --check .
uv run mypy app
ALLOW_UNVERIFIED_ANON_KEY=true uv run python scripts/export_openapi.py  # 스키마를 고쳤으면 반드시
```

로컬에서 백엔드를 띄우려면 `ENVIRONMENT=local` 과 `ALLOW_UNVERIFIED_ANON_KEY=true` 가 필요하다.
인증서가 없으면 익명키 검증기를 만들 수 없어 **기동이 실패한다**(`create_app` 이 검증기를 먼저 만든다).
검증 생략은 `local` 에서만 켤 수 있다. dev 도 QR 테스트로 여러 사람이 붙는 공용 서버라 막아 뒀다.

## 시간대

**월 경계와 '오늘'은 사용자 시간대(`users.timezone`, 기본 `Asia/Seoul`) 기준이다.**
DB 에는 UTC 로 저장하고, 조회할 때 `service.today_for` · `service.period_for` 로 되돌린다.
UTC 로 날짜를 뽑으면 한국에서 자정부터 아침 9시까지 저장한 거래가 전달로 집계된다.
