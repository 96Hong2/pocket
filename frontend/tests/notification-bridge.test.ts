import { describe, expect, it } from 'vitest';

import { createBridge } from '../src/shared/toss';

/**
 * 알림 동의 브릿지의 갈래.
 *
 * e2e 는 devtools 목을 쓰는데 그 목은 `isSupported` 가 늘 true 라, **낮은 토스 앱 버전에서
 * 알림을 못 쓰는 화면을 e2e 로는 만들 수 없다.** 그 갈래를 여기서 본다.
 * 거절도 함께 본다. 거절은 오류가 아니라 결과의 한 종류라는 계약이 여기서 굳는다.
 */
describe('알림 동의 브릿지', () => {
  it('못 쓰는 버전이면 UNSUPPORTED 를 던진다', async () => {
    const bridge = createBridge({
      forceMock: true,
      scenario: { unsupported: ['notification'] },
    });

    expect(bridge.supports('notification')).toBe(false);
    await expect(bridge.requestNotificationAgreement('tmpl')).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
  });

  it('거절은 던지지 않고 결과로 온다', async () => {
    const bridge = createBridge({
      forceMock: true,
      scenario: { notification: 'agreementRejected' },
    });

    await expect(bridge.requestNotificationAgreement('tmpl')).resolves.toBe('agreementRejected');
  });

  it('시나리오를 안 주면 이미 동의한 것으로 본다', async () => {
    const bridge = createBridge({ forceMock: true });

    expect(bridge.supports('notification')).toBe(true);
    await expect(bridge.requestNotificationAgreement('tmpl')).resolves.toBe('alreadyAgreed');
  });
});
