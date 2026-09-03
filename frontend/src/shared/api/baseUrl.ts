/**
 * API 주소를 정한다. **절대주소로 간다.**
 *
 * vite 프록시(같은 출처로 위장)를 쓰면 로컬에서 CORS 가 한 번도 돌지 않아, 배포하고 나서야
 * 처음 막힌다. 개발에서도 실제와 같은 교차 출처 요청을 보내 미리 깨지게 둔다.
 * 백엔드는 `localhost:5173` 과 tossmini 도메인을 이미 허용한다.
 */

/** 빌드 때 넣는 환경변수 이름. 값은 `frontend/.env.example` 을 본다. */
export const API_BASE_URL_ENV = 'VITE_API_BASE_URL';

/** 개발 기본값. `make dev-back` 이 띄우는 백엔드다. */
const DEV_FALLBACK = 'http://localhost:8000';

/**
 * 설정된 주소를 읽는다.
 *
 * `import.meta.env.VITE_...` 는 vite 가 빌드 때 문자열로 갈아 끼운다. 키를 변수로 만들어
 * 꺼내면 그 치환이 안 걸려 운영 빌드에서 값이 사라진다. 그래서 여기서만 직접 적는다.
 */
function configured(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * 없으면 null 을 돌려준다. **모듈을 읽는 시점에 던지지 않는다.**
 * 여기서 던지면 앱 껍데기까지 같이 죽어 사용자는 하얀 화면만 본다.
 * 요청을 보낼 때 `CLIENT_CONFIG` 오류로 드러나고, 그러면 오류 화면이라도 뜬다.
 */
export function resolveApiBaseUrl(): string | null {
  const value = configured();
  if (value !== '') return value.replace(/\/+$/, '');
  return import.meta.env.DEV ? DEV_FALLBACK : null;
}
