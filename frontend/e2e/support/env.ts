/**
 * e2e 스택의 주소.
 *
 * 개발 스택(프론트 5173 · 백엔드 8000 · DB pocket)과 포트도 DB 도 갈라 둔다.
 * 손으로 띄워 둔 개발 서버를 테스트가 주워 쓰면 개발 데이터에 테스트가 쓴다.
 */
export const E2E_WEB_PORT = 5183;
export const E2E_API_PORT = 8100;

export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`;
export const E2E_API_URL = `http://localhost:${E2E_API_PORT}`;

/** 개발 스택 주소. 여기로 요청이 나가면 가드가 테스트를 실패시킨다. */
export const DEV_STACK_URLS = ['http://localhost:5173', 'http://localhost:8000'] as const;

export const E2E_DATABASE_URL =
  process.env.POCKET_E2E_DATABASE_URL ??
  'postgresql+psycopg://pocket:pocket@localhost:5434/pocket_e2e';
