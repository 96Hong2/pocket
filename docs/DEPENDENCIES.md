# 의존성

여기 적힌 버전은 추정이 아니라 **실제로 설치된 것**이다.
프론트는 `frontend/package-lock.json` 의 resolved 버전, 백엔드는 `backend/.venv` 에 설치된 것(`uv pip list`)을 그대로 옮겼다.
확인 시점: 2026-09-03. Node v26.3.0 / npm 11.16.0 / Python 3.14.4.

버전을 올렸으면 이 문서도 같이 고친다. 여기가 낡으면 아무도 안 믿는다.

## 프론트엔드

### 런타임

| 패키지 | 설치됨 | npm latest | 왜 |
|---|---|---|---|
| react | 19.2.8 | 19.2.8 | 최신 안정. Vite 템플릿 기본값이고 내려야 할 이유가 없다 |
| react-dom | 19.2.8 | 19.2.8 | react 와 짝 |
| react-router | 8.3.1 | 8.3.1 | 화면 18개에 뒤로가기·딥링크가 필요하다. v8 은 `react-router-dom` 없이 단일 패키지다 |
| @tanstack/react-query | 5.102.8 | 5.102.8 | 서버 상태 캐시·무효화. 저장 직후 홈이 즉시 갱신돼야 해서 필요하다 |
| zod | 4.5.4 | 4.5.4 | API 응답 검증용. ⚠ **아직 어디서도 쓰지 않는다.** `shared/api` 를 만들 때 쓰거나 빼기로 정한다. LLM structured output 검증은 백엔드 pydantic 이 한다 |
| @apps-in-toss/web-framework | 3.2.0 | 3.2.0 | 미니앱 SDK. 최신 안정 3.x |

### 빌드·개발 도구

| 패키지 | 설치됨 | npm latest | 왜 |
|---|---|---|---|
| vite | 8.2.2 | 8.2.2 | 번들러. `ait build` 가 `dist` 를 그대로 감싼다 |
| @vitejs/plugin-react | 6.1.1 | 6.1.1 | React 변환(Oxc 기반) |
| typescript | 7.0.2 | 7.0.2 | 최신 안정 |
| tailwindcss | 4.3.3 | 4.3.3 | **토큰 선언에만 쓴다.** `@theme` 로 색·반경을 정의해 hex 하드코딩을 막는다. tsx 에 유틸리티 클래스는 쓰지 않는다(AI_DEV_RULES §6) |
| @tailwindcss/vite | 4.3.3 | 4.3.3 | Tailwind 4 의 Vite 플러그인. PostCSS 설정이 필요 없다 |
| @apps-in-toss/devtools | 3.2.0 | 3.2.0 | dev 서버에 목 SDK 를 주입한다. 브라우저에서 `sandbox` 로 잡히는 이유 |
| oxlint | 1.81.0 | 1.81.0 | 린터. Vite 8 템플릿 기본값이고 ESLint 보다 빠르다 |
| prettier | 3.9.6 | 3.9.6 | 포매터 |

### 테스트

| 패키지 | 설치됨 | npm latest | 왜 |
|---|---|---|---|
| vitest | 4.1.11 | 4.1.11 | Vite 설정을 그대로 쓴다 |
| @vitest/coverage-v8 | 4.1.11 | 4.1.11 | 커버리지 |
| jsdom | 30.0.1 | 30.0.1 | DOM 환경 |
| @testing-library/react | 16.3.3 | 16.3.3 | 컴포넌트 테스트 |
| @testing-library/jest-dom | 7.0.1 | 7.0.1 | DOM 단언 |
| @testing-library/user-event | 14.6.7 | 14.6.7 | 실제 입력에 가까운 이벤트 |

### 타입 정의

`@types/node` 24.13.3 / `@types/react` 19.2.18 / `@types/react-dom` 19.2.5.
`package.json` 은 `@types/react-dom` 을 `^19.2.4` 로 적었지만 실제로 설치된 것은 19.2.5 다. 캐럿 범위 안이라 문제는 없다.

### 직접 의존성이 아닌데 트리에 있는 것

`@apps-in-toss/cli` 3.2.0 과 `@apps-in-toss/ait-format` 1.0.0 은 `web-framework` 가 끌고 온다.
`npm run build` 의 `ait build`, `npm run deploy` 의 `ait deploy` 가 이걸 쓴다. 따로 설치하지 않아도 된다.

## 백엔드

### 런타임

| 패키지 | 설치됨 | PyPI latest | 왜 |
|---|---|---|---|
| fastapi | 0.141.1 | 0.141.1 | OpenAPI 를 자동으로 뽑는다. 프론트 타입의 정본이 된다 |
| uvicorn[standard] | 0.52.4 | 0.52.4 | ASGI 서버 |
| sqlalchemy | 2.0.52 | 2.0.52 | ORM. 2.0 타입 스타일(`Mapped[...]`)을 쓴다 |
| alembic | 1.19.1 | 1.19.1 | 마이그레이션. 스키마 변경 이력이 코드로 남는다 |
| psycopg[binary] | 3.3.5 | 3.3.5 | PostgreSQL 드라이버 3.x. binary 는 로컬 빌드 없이 설치된다 |
| pydantic | 2.13.5 | 2.13.5 | 요청·응답 스키마. fastapi 가 끌고 온다 |
| pydantic-settings | 2.15.0 | 2.15.0 | 환경변수 설정. 운영 광고 ID·DB URL 을 코드에서 분리한다 |
| httpx | 0.28.1 | 0.28.1 | Toss 서버 API 호출. mTLS 클라이언트 인증서를 그대로 지원한다 |
| python-json-logger | 4.2.0 | 4.2.0 | 구조화 로그. OCR/LLM 원문이 로그에 새지 않게 필드를 통제한다 |

### 개발

| 패키지 | 설치됨 | PyPI latest | 왜 |
|---|---|---|---|
| pytest | 9.1.1 | 9.1.1 | 도메인 계산 테스트 |
| pytest-asyncio | 1.4.0 | 1.4.0 | async 라우터·클라이언트 테스트 |
| pytest-cov | 7.1.0 | 7.1.0 | 커버리지 |
| ruff | 0.16.5 | 0.16.5 | 린트와 포맷을 한 도구로. black + flake8 + isort 를 대체한다 |
| mypy | 2.3.1 | 2.3.1 | 타입 체크 |

`pyproject.toml` 은 `requires-python = ">=3.13"` 이고 실제 venv 는 **3.14.4** 다. 3.13 을 하한으로 둔 것은 배포 환경이 아직 3.14 를 안 줄 수도 있어서다.

## beta / rc / canary 확인

**직접 의존성에는 프리릴리즈가 하나도 없다.** 프론트 23개, 백엔드 14개 전부 안정 버전이다.
`package-lock.json` 전체 368개 패키지를 훑으면 프리릴리즈가 둘 나온다.

- `clipanion@4.0.0-rc.4` : `@apps-in-toss/cli` 가 고정해서 끌고 온다
- `gensync@1.0.0-beta.2` : `@babel/core` 가 오래 전부터 쓰는 버전이다

둘 다 우리가 고른 것이 아니고 빌드 도구 안쪽에 있다. 런타임 번들에는 들어가지 않는다. 우리가 손댈 수 있는 것도 아니라 그대로 둔다.

확인 방법:

```bash
cd frontend
node -e "const l=require('./package-lock.json');for(const [k,v] of Object.entries(l.packages))if(v.version&&/-(beta|rc|canary|alpha|next)/i.test(v.version))console.log(k,v.version)"
```

## 안 쓰기로 한 것

| 후보 | 왜 안 쓰나 |
|---|---|
| `@toss/tds-mobile` (2.5.1) | peer 가 `react: ^16.8.3 \|\| ^17 \|\| ^18` 이라 React 19 를 막는다. 게다가 상단 네비게이션은 플랫폼이 그려서 컴포넌트가 없고 하단 탭바는 TDS 에 아예 없다. 나머지는 세이지/앰버 커스텀이라 남는 게 적다. `docs/ADR/0002-no-tds-in-mvp.md` |
| Zustand 등 전역 상태 | 서버 상태는 TanStack Query, 화면 상태는 `useState` 로 충분하다. 서버 데이터를 전역 스토어에 복사하면 두 벌이 되고 어긋난다 |
| 서비스워커 / offline-first | 캐시 무효화와 버전 스큐 비용이 얻는 것보다 크다. 오프라인 대비는 키패드 입력 로컬 큐까지 |
| axios | `fetch` 로 충분하다. 인터셉터가 필요하면 `shared/api` 에서 감싼다 |
| black / flake8 / isort | ruff 하나가 다 한다 |

## 새 패키지를 넣기 전에

1. 표준 기능이나 이미 있는 의존성으로 되는지 확인한다.
2. 최신 안정 버전인지, 프리릴리즈가 아닌지 확인한다.
3. 번들 크기와 유지보수 상태를 본다. 미니앱은 첫 로딩이 곧 이탈이다.
4. 넣었으면 이 문서에 실제 resolved 버전과 이유를 적는다.
