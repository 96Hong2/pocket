/**
 * HTTP 한 번을 보내는 자리. 여기 말고는 아무 데서도 `fetch` 를 부르지 않는다.
 *
 * 하는 일은 넷이다.
 * - 익명 식별키 헤더를 붙인다(없으면 아예 보내지 않는다)
 * - 제한 시간을 건다
 * - 오류 봉투를 풀어 `ApiError` 하나로 바꾼다
 * - 본문 없는 응답(204)을 정상으로 처리한다
 */

import { resolveApiBaseUrl } from './baseUrl';
import { ApiError, CLIENT_ERROR_CODES, parseErrorEnvelope } from './errors';

/**
 * 익명 식별키 상태.
 *
 * 클라이언트가 브릿지를 직접 부르지 않는다. `IdentityProvider` 가 들고 있는 상태를
 * 게터로 받아 쓴다. 그래야 식별키가 바뀌어도 클라이언트 인스턴스를 다시 만들지 않는다.
 */
export type AnonKeyState =
  | { status: 'ready'; key: string }
  | { status: 'pending' }
  | { status: 'unsupported' }
  | { status: 'failed' };

/** 지하철에서 저장 버튼이 영원히 로딩으로 남지 않게 하는 값. */
const DEFAULT_TIMEOUT_MS = 10_000;

export interface TransportOptions {
  getAnonKey(): AnonKeyState;
  /** 테스트에서만 넘긴다. 평소에는 환경변수로 정해진다. */
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface RequestSpec {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: QueryParams;
  /** 있으면 JSON 으로 실어 보낸다. */
  body?: unknown;
  /** 화면이 떠나면 요청을 끊는다. TanStack Query 가 넘겨 준다. */
  signal?: AbortSignal;
}

export interface Transport {
  /** 본문이 있는 응답. 204 처럼 본문이 없으면 undefined 가 온다. */
  request<T>(spec: RequestSpec): Promise<T>;
  /** 지금 요청을 보낼 수 있나. 식별키가 준비됐는지만 본다. */
  isReady(): boolean;
}

const IDENTITY_ERROR_CODES = {
  pending: CLIENT_ERROR_CODES.identityPending,
  unsupported: CLIENT_ERROR_CODES.identityUnsupported,
  failed: CLIENT_ERROR_CODES.identityFailed,
} as const;

function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs === '' ? `${baseUrl}${path}` : `${baseUrl}${path}?${qs}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createTransport(options: TransportOptions): Transport {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  function resolveBase(): string {
    const baseUrl = options.baseUrl ?? resolveApiBaseUrl();
    if (baseUrl == null) {
      throw new ApiError({ code: CLIENT_ERROR_CODES.config });
    }
    return baseUrl;
  }

  function anonKey(): string {
    const state = options.getAnonKey();
    if (state.status === 'ready') return state.key;
    // 서버 401 과 구분되는 우리 쪽 사유다. 화면이 '업데이트 안내' 와 '다시 시도' 를 여기서 가른다.
    throw new ApiError({ code: IDENTITY_ERROR_CODES[state.status] });
  }

  async function request<T>(spec: RequestSpec): Promise<T> {
    const url = buildUrl(resolveBase(), spec.path, spec.query);
    const key = anonKey();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Anon-Key': key,
    };
    if (spec.body !== undefined) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const caller = spec.signal;
    const forwardAbort = () => controller.abort();
    caller?.addEventListener('abort', forwardAbort);
    if (caller?.aborted === true) controller.abort();

    /** 호출자가 끊은 것은 오류가 아니다. 그대로 올려 TanStack Query 가 취소로 다루게 둔다. */
    function toApiError(cause: unknown, status: number | null): never {
      if (caller?.aborted === true) throw cause;
      const code = timedOut ? CLIENT_ERROR_CODES.timeout : CLIENT_ERROR_CODES.network;
      throw new ApiError({ code, status, cause });
    }

    // 제한 시간은 본문을 다 읽을 때까지 살아 있어야 한다. 헤더만 받고 본문에서 멈추는 연결이 있다.
    try {
      let response: Response;
      try {
        response = await doFetch(url, {
          method: spec.method,
          headers,
          body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
          signal: controller.signal,
        });
      } catch (cause) {
        toApiError(cause, null);
      }

      // 되돌리기와 삭제가 204 다. 본문을 읽으려 들면 빈 문자열에서 파싱이 터진다.
      if (response.status === 204 || response.status === 205) {
        if (response.ok) return undefined as T;
        throw new ApiError({ code: 'HTTP_ERROR', status: response.status });
      }

      let text: string;
      try {
        text = await response.text();
      } catch (cause) {
        toApiError(cause, response.status);
      }

      if (!response.ok) {
        const parsed = parseErrorEnvelope(safeJson(text));
        throw new ApiError({
          code: parsed.code,
          status: response.status,
          serverMessage: parsed.message,
        });
      }

      if (text.trim() === '') return undefined as T;

      try {
        return JSON.parse(text) as T;
      } catch (cause) {
        throw new ApiError({
          code: CLIENT_ERROR_CODES.badResponse,
          status: response.status,
          cause,
        });
      }
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener('abort', forwardAbort);
    }
  }

  return {
    request,
    isReady: () => options.getAnonKey().status === 'ready',
  };
}
