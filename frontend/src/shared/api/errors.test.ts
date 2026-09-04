import { describe, expect, it } from 'vitest';

import { ApiError, apiErrorMessage, parseErrorEnvelope } from './errors';

/**
 * 오류 봉투를 푸는 자리만 본다.
 * fetch 를 목으로 감싼 클라이언트 테스트는 만들지 않는다. 배선을 끊어도 통과한다.
 */
describe('parseErrorEnvelope', () => {
  it('정상 봉투에서 code 와 message 를 꺼낸다', () => {
    expect(
      parseErrorEnvelope({
        error: { code: 'UNDO_EXPIRED', message: '되돌릴 수 있는 시간이 지났어요.' },
      }),
    ).toEqual({ code: 'UNDO_EXPIRED', message: '되돌릴 수 있는 시간이 지났어요.' });
  });

  it('계약 표에 없는 code 도 그대로 통과시킨다', () => {
    expect(
      parseErrorEnvelope({ error: { code: 'RATE_LIMITED', message: '잠시 뒤에요.' } }),
    ).toEqual({ code: 'RATE_LIMITED', message: '잠시 뒤에요.' });
  });

  it('봉투가 아닌 본문은 HTTP_ERROR 로 떨어진다', () => {
    const fallback = { code: 'HTTP_ERROR', message: null };

    expect(parseErrorEnvelope({ detail: 'Not Found' })).toEqual(fallback);
    expect(parseErrorEnvelope('502 Bad Gateway')).toEqual(fallback);
    expect(parseErrorEnvelope([{ error: { code: 'NOT_FOUND' } }])).toEqual(fallback);
    expect(parseErrorEnvelope({ error: 'NOT_FOUND' })).toEqual(fallback);
    expect(parseErrorEnvelope({ error: { code: 42 } })).toEqual(fallback);
  });

  it('빈 본문도 던지지 않는다', () => {
    expect(parseErrorEnvelope(null)).toEqual({ code: 'HTTP_ERROR', message: null });
    expect(parseErrorEnvelope(undefined)).toEqual({ code: 'HTTP_ERROR', message: null });
  });

  it('message 가 비어 있으면 null 로 둔다', () => {
    expect(parseErrorEnvelope({ error: { code: 'NOT_FOUND', message: '   ' } })).toEqual({
      code: 'NOT_FOUND',
      message: null,
    });
  });
});

describe('문구 폴백', () => {
  it('서버 문구를 먼저 쓴다', () => {
    // 같은 code 라도 서버는 상황을 알고 말한다. 우리 문구로 덮으면 무엇을 고칠지 알 수 없다.
    expect(apiErrorMessage('INVALID_REQUEST', '전체 예산을 먼저 정해 주세요.')).toBe(
      '전체 예산을 먼저 정해 주세요.',
    );
    expect(apiErrorMessage('PERIOD_CLOSED', '지난 기간의 예산은 바꿀 수 없어요.')).toBe(
      '지난 기간의 예산은 바꿀 수 없어요.',
    );
  });

  it('서버 문구가 없으면 code 별 우리 문구로 간다', () => {
    expect(apiErrorMessage('UNDO_EXPIRED', null)).toBe('되돌릴 수 있는 시간이 지났어요.');
    // 요청이 서버에 닿지 못한 실패는 서버 문구가 있을 수 없다.
    expect(apiErrorMessage('CLIENT_NETWORK')).toBe('연결이 불안정해요. 네트워크를 확인해 주세요.');
  });

  it('둘 다 없으면 기본값으로 간다', () => {
    expect(apiErrorMessage('RATE_LIMITED', null)).toBe('잠시 뒤 다시 시도해 주세요.');
  });
});

describe('재시도 판단', () => {
  it('되돌리기 창을 태우는 상태는 다시 부르지 않는다', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(new ApiError({ code: 'CONFLICT', status }).isRetryable).toBe(false);
    }
  });

  it('일시적인 실패는 다시 부른다', () => {
    expect(new ApiError({ code: 'VERIFY_UNAVAILABLE', status: 503 }).isRetryable).toBe(true);
    expect(new ApiError({ code: 'CLIENT_NETWORK' }).isRetryable).toBe(true);
    expect(new ApiError({ code: 'CLIENT_TIMEOUT' }).isRetryable).toBe(true);
  });

  it('우리 쪽 사정으로 못 보낸 것은 다시 부르지 않는다', () => {
    expect(new ApiError({ code: 'CLIENT_IDENTITY_UNSUPPORTED' }).isRetryable).toBe(false);
    expect(new ApiError({ code: 'CLIENT_CONFIG' }).isRetryable).toBe(false);
  });
});
