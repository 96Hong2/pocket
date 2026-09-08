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

/**
 * 글꼴을 받아 오는 곳.
 *
 * 인터넷이 느리거나 막힌 곳에서는 못 받고 폴백 스택으로 그려진다. 배치는 그대로다.
 * 이 주소의 실패만 눈감고, 우리 자원이 실패하면 그대로 터지게 둔다.
 */
export const FONT_CDN = /cdn\.jsdelivr\.net/;

export const E2E_DATABASE_URL =
  process.env.POCKET_E2E_DATABASE_URL ??
  'postgresql+psycopg://pocket:pocket@localhost:5434/pocket_e2e';
