/**
 * 행동 로그를 보내는 유일한 자리.
 *
 * 수집 경로는 토스 공식 Analytics 하나다. 새 분석 도구를 붙이지 않는다.
 * 화면은 `useAnalytics()` 로 이 객체를 받아 이름과 값만 넘긴다.
 *
 * 여기가 붙이는 공통 값:
 * - `event_id` 같은 로그가 두 번 도착해도 하나로 셀 수 있게. 재전송 중복 제거의 열쇠다
 * - `session_id` 앱을 연 한 번
 * - `flow_id` 기록 시작부터 저장까지. 흐름을 잇는 값이라 화면이 넘겨 준다
 * - `app_version` · `os` · `env` 어느 판에서 난 일인지
 *
 * 발생 시각은 SDK 가 붙이고, 서버 수신 시각은 수집기가 붙인다. 우리가 지어내지 않는다.
 * 분석용 사용자 ID(`anonymous_key`)도 SDK 가 자동으로 넣는다.
 *
 * **로그가 실패해도 아무 일도 일어나지 않는다.** 브릿지가 삼킨다. 대기열도 재시도도 두지
 * 않는다. 기록이 로그 때문에 늦거나 막히면 그 순간 이 앱은 존재 이유를 잃는다.
 */

import type { AnalyticsKind, AnalyticsParams, MiniAppBridge } from '../toss';

import type { EventName } from './events';

/** 흐름 하나를 가리키는 값. 기록 시작부터 저장까지 같은 값을 물고 간다. */
export type FlowId = string;

export interface LogOptions {
  /** 이 로그가 속한 흐름. 없으면 흐름 밖에서 난 일이다. */
  flowId?: FlowId;
  /** screen·click·impression 중 하나. 안 주면 그 밖의 사실(event)이다. */
  kind?: AnalyticsKind;
}

/**
 * 무작위 id.
 *
 * `crypto.randomUUID` 가 없는 환경(오래된 WebView·비보안 출처)이 있어 대비를 둔다.
 * 이 값으로 무엇을 지키는 것이 아니라 세는 것뿐이라 대비 쪽 품질로도 충분하다.
 */
function newId(): string {
  const generator = globalThis.crypto;
  if (generator != null && typeof generator.randomUUID === 'function') {
    return generator.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class Analytics {
  private readonly bridge: MiniAppBridge;
  private readonly sessionId = newId();
  /** 앱을 연 로그는 세션당 한 번이다. 화면이 다시 마운트돼도 늘지 않는다. */
  private opened = false;

  constructor(bridge: MiniAppBridge) {
    this.bridge = bridge;
  }

  /** 새 흐름을 연다. 돌려준 값을 그 흐름의 모든 로그에 넘긴다. */
  startFlow(): FlowId {
    return newId();
  }

  log(name: EventName, params: AnalyticsParams = {}, options: LogOptions = {}): void {
    this.bridge.analytics.log(options.kind ?? 'event', name, {
      event_id: newId(),
      session_id: this.sessionId,
      flow_id: options.flowId,
      app_version: __APP_VERSION__,
      os: this.bridge.platform,
      // 운영과 테스트를 갈라 놓지 않으면 QR 로 눌러 본 것이 지표에 섞인다.
      env: this.bridge.environment,
      ...params,
    });
  }

  /** 앱을 연 사실. 두 번째부터는 아무 일도 하지 않는다. */
  appOpen(name: EventName, params: AnalyticsParams = {}): void {
    if (this.opened) return;
    this.opened = true;
    this.log(name, params);
  }
}
