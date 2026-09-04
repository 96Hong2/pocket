/**
 * 오류를 화면이 쓸 수 있는 모양으로 바꾼다.
 *
 * 서버는 성공이 아닌 응답을 항상 `{"error":{"code","message"}}` 로 준다.
 * 화면은 `code` 로만 분기하고, 문구는 `message` 를 쓴다.
 */

import type { ErrorCode } from './types';

/**
 * 요청이 서버에 닿기도 전에 우리 쪽 사정으로 실패한 경우.
 *
 * 서버 code 와 섞이면 화면이 '업데이트 안내' 와 '다시 시도' 를 가르지 못한다.
 * `CLIENT_` 접두사를 붙여 계약 표의 값과 절대 겹치지 않게 한다.
 */
export const CLIENT_ERROR_CODES = {
  /** 익명 식별키를 아직 받는 중이다. */
  identityPending: 'CLIENT_IDENTITY_PENDING',
  /** 토스 앱이 낡아 익명 식별키를 못 받는다. 업데이트를 안내한다. */
  identityUnsupported: 'CLIENT_IDENTITY_UNSUPPORTED',
  /** 익명 식별키 조회가 실패했다. 다시 시도할 수 있다. */
  identityFailed: 'CLIENT_IDENTITY_FAILED',
  /** 응답이 제한 시간 안에 오지 않았다. */
  timeout: 'CLIENT_TIMEOUT',
  /** 요청 자체가 나가지 못했다. */
  network: 'CLIENT_NETWORK',
  /** API 주소가 설정되지 않은 빌드다. */
  config: 'CLIENT_CONFIG',
  /** 2xx 인데 본문이 JSON 이 아니다. */
  badResponse: 'CLIENT_BAD_RESPONSE',
} as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[keyof typeof CLIENT_ERROR_CODES];

/**
 * 화면이 분기에 쓰는 code.
 *
 * **유니온을 닫지 않는다.** 계약 표에 없는 값이 서버에서 새로 와도 문자열 그대로 받아
 * 기본 문구로 흘려보내야 한다. `string & {}` 는 자동완성을 남기면서 문을 열어 두는 표기다.
 */
export type ApiErrorCode = ErrorCode | ClientErrorCode | (string & {});

/**
 * 서버가 문구를 주지 않았을 때 쓸 code 별 우리 문구.
 *
 * 서버 문구를 이걸로 덮지 않는다. 같은 code 라도 서버는 상황을 알고 말한다.
 * "전체 예산을 먼저 정해 주세요" 를 "입력한 내용을 다시 확인해 주세요" 로 바꾸면
 * 사용자는 무엇을 고쳐야 하는지 영영 모른다.
 */
const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: '사용자 확인에 실패했어요. 앱을 다시 열어 주세요.',
  VERIFY_UNAVAILABLE: '지금은 확인이 어려워요. 잠시 뒤 다시 시도해 주세요.',
  NOT_FOUND: '찾을 수 없는 기록이에요.',
  UNDO_EXPIRED: '되돌릴 수 있는 시간이 지났어요.',
  CONFLICT: '잠깐 겹쳤어요. 다시 시도해 주세요.',
  INVALID_REQUEST: '입력한 내용을 다시 확인해 주세요.',
  INVALID_CATEGORY: '고를 수 없는 카테고리예요.',
  INVALID_REFUND_TARGET: '환불할 지출을 찾지 못했어요.',
  HTTP_ERROR: '요청을 처리하지 못했어요.',
  INTERNAL_ERROR: '문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.',

  [CLIENT_ERROR_CODES.identityPending]: '사용자 확인을 기다리는 중이에요.',
  // IdentityProvider 가 화면에 띄우는 안내와 같은 문장이다. 같은 상황이라 다르게 적지 않는다.
  [CLIENT_ERROR_CODES.identityUnsupported]:
    '토스 앱을 최신 버전으로 업데이트하면 기록을 저장할 수 있어요.',
  [CLIENT_ERROR_CODES.identityFailed]: '사용자 정보를 확인하지 못했어요.',
  [CLIENT_ERROR_CODES.timeout]: '응답이 늦어요. 잠시 뒤 다시 시도해 주세요.',
  [CLIENT_ERROR_CODES.network]: '연결이 불안정해요. 네트워크를 확인해 주세요.',
  [CLIENT_ERROR_CODES.config]: '서버 주소를 찾지 못했어요.',
  [CLIENT_ERROR_CODES.badResponse]: '응답을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.',
};

const DEFAULT_MESSAGE = '잠시 뒤 다시 시도해 주세요.';

/** 서버 message → code 별 우리 문구 → 기본값 순으로 고른다. */
export function apiErrorMessage(code: ApiErrorCode, serverMessage?: string | null): string {
  return serverMessage ?? MESSAGES[code] ?? DEFAULT_MESSAGE;
}

export interface ParsedErrorBody {
  code: ApiErrorCode;
  /** 서버가 준 문구. 봉투가 아니거나 비어 있으면 null. */
  message: string | null;
}

/**
 * 봉투가 아닌 본문이 왔을 때 쓰는 값.
 *
 * 우리 백엔드는 항상 봉투를 보내므로, 봉투가 아니라는 것은 앞단(프록시·게이트웨이)이나
 * 잘못된 주소가 답했다는 뜻이다. 계약 표에서 그 자리를 맡는 code 가 `HTTP_ERROR` 다.
 */
const NOT_AN_ENVELOPE: ParsedErrorBody = { code: 'HTTP_ERROR', message: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 오류 본문을 code 와 message 로 푼다. 던지지 않는다.
 *
 * 계약 표에 없는 code 도 문자열 그대로 통과시킨다. 여기서 값을 검사해 막으면
 * 서버가 code 를 하나 늘릴 때마다 프론트가 먼저 죽는다.
 */
export function parseErrorEnvelope(body: unknown): ParsedErrorBody {
  if (!isRecord(body)) return NOT_AN_ENVELOPE;

  const error = body['error'];
  if (!isRecord(error)) return NOT_AN_ENVELOPE;

  const code = error['code'];
  if (typeof code !== 'string' || code === '') return NOT_AN_ENVELOPE;

  const message = error['message'];
  const hasMessage = typeof message === 'string' && message.trim() !== '';

  return { code, message: hasMessage ? message : null };
}

/** 다시 불러 봐야 결과가 같은 실패. */
const NO_RETRY_CODES: ReadonlySet<string> = new Set([
  CLIENT_ERROR_CODES.identityPending,
  CLIENT_ERROR_CODES.identityUnsupported,
  CLIENT_ERROR_CODES.identityFailed,
  CLIENT_ERROR_CODES.config,
  CLIENT_ERROR_CODES.badResponse,
]);

/** 요청이 잘못됐거나 대상이 없는 상태. 되돌리기 창을 재시도로 태우지 않게 여기서 끊는다. */
const NO_RETRY_STATUS: ReadonlySet<number> = new Set([400, 401, 403, 404, 409, 422]);

export interface ApiErrorInit {
  code: ApiErrorCode;
  /** HTTP 상태. 요청이 서버에 닿기 전이면 null. */
  status?: number | null;
  /** 서버 message 원문. 로그에 남기거나 문구 폴백에 쓴다. */
  serverMessage?: string | null;
  cause?: unknown;
}

/** API 실패의 유일한 형태. 화면은 `code` 로 분기하고 `message` 를 그대로 보여 준다. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  readonly serverMessage: string | null;

  constructor(init: ApiErrorInit) {
    super(apiErrorMessage(init.code, init.serverMessage), { cause: init.cause });
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status ?? null;
    this.serverMessage = init.serverMessage ?? null;
  }

  /** 그대로 다시 부를 만한 실패인가. QueryProvider 의 재시도 판단이 이걸 본다. */
  get isRetryable(): boolean {
    if (NO_RETRY_CODES.has(this.code)) return false;
    if (this.status !== null && NO_RETRY_STATUS.has(this.status)) return false;
    return true;
  }
}
