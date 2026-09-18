import { useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { useSaveNotificationSettings } from '../../shared/api';
import { BridgeError, type MiniAppBridge } from '../../shared/toss';

/**
 * 알림을 켜는 절차가 두 자리에 있다. 알림 설정 화면과 홈의 권유 카드다.
 * 절차를 두 벌 적으면 한쪽만 고쳐져 「켰는데 안 와요」 가 된다. 여기 한 곳에 둔다.
 */

/**
 * 안 정하면 이 시각이다. 서버(`app/modules/notifications/service.py`)와 같은 값이다.
 *
 * 저녁 8시: 하루 지출이 거의 끝났고, 아직 잠들기 전이라 적을 수 있다.
 */
export const REMIND_AT_DEFAULT = '20:00';

/** 켤 수 없게 된 이유. 화면이 무엇을 말할지 여기서 갈린다. */
export type RemindBlocker = 'unsupported' | 'rejected' | 'failed';

/**
 * 어디서 켰나.
 *
 * 홈 카드에서 한 번에 켜지는 길을 낸 뒤로, 알림 설정 화면까지 들어가 켜는 사람이
 * 얼마나 되는지 따로 봐야 한다. 둘을 못 가르면 카드가 실제로 일을 하는지 알 수 없다.
 */
export type RemindOptInWhere = 'settings' | 'home_card';

export const REMIND_BLOCKER_NOTICE: Record<Exclude<RemindBlocker, 'unsupported'>, string> = {
  rejected: '토스 알림 동의를 하지 않아 알림을 켤 수 없어요. 토스 앱 알림 설정에서 바꿀 수 있어요.',
  failed: '알림 동의를 받지 못했어요. 잠시 후 다시 시도해 주세요.',
};

/**
 * 못 쓰는 이유 한 줄.
 *
 * "토스 앱을 업데이트하세요" 만 말하면 이미 최신인 사람은 무엇을 해야 할지 모른다.
 * 숫자 둘을 나란히 보여 주면 업데이트로 풀리는 일인지 스스로 가를 수 있다.
 */
export function unsupportedNotice(bridge: MiniAppBridge): string {
  const required = bridge.minAppVersion('notification');
  if (required == null || bridge.appVersion === '') {
    return '기록 알림은 토스 앱을 업데이트하면 쓸 수 있어요.';
  }
  return `기록 알림은 토스 앱 ${required} 이상에서 쓸 수 있어요. 지금 쓰는 토스 앱은 ${bridge.appVersion} 이에요.`;
}

/**
 * 토스 알림 동의를 받고 설정을 저장한다.
 *
 * 켜는 그 순간에만 동의를 묻는다. 화면에 들어오자마자 묻지 않는다. 거절도 결과의 한
 * 종류라 실패로 다루지 않고, **다시 묻지 않는다.** 눌러도 계속 동의 창이 뜨면 거절한
 * 사람에게 같은 것을 반복해서 묻게 된다.
 */
export function useRemindOptIn(where: RemindOptInWhere): {
  /** 동의 창이 떠 있거나 저장 중. 버튼을 잠근다. */
  busy: boolean;
  blocker: RemindBlocker | null;
  supported: boolean;
  /** 저장 실패 문구. 없으면 null. */
  saveError: unknown;
  save: ReturnType<typeof useSaveNotificationSettings>;
  /** 켠다. 켜졌으면 true. `remindAt` 을 안 주면 서버가 기본 시각을 넣는다. */
  turnOn: (remindAt?: string) => Promise<boolean>;
  turnOff: () => void;
  clearBlocker: () => void;
} {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const save = useSaveNotificationSettings();
  const supported = bridge.supports('notification');
  const [blocker, setBlocker] = useState<RemindBlocker | null>(() =>
    supported ? null : 'unsupported',
  );
  const [asking, setAsking] = useState(false);

  async function turnOn(remindAt?: string): Promise<boolean> {
    setAsking(true);
    try {
      const result = await bridge.requestNotificationAgreement(templateCode());
      /*
        알림은 이 앱이 사람을 다시 데려오는 유일한 장치다. 몇 명이 켰는지 모르면
        재방문율이 낮을 때 알림이 안 닿은 것인지 알림을 켠 사람이 없는 것인지 못 가른다.
        결과 갈래만 남긴다. 시각도 주기도 싣지 않는다.
      */
      analytics.log(EVENTS.notificationResult, { result, where }, { kind: 'click' });
      if (result === 'agreementRejected') {
        setBlocker('rejected');
        return false;
      }
    } catch (error) {
      const code =
        error instanceof BridgeError && error.code === 'UNSUPPORTED' ? 'unsupported' : 'failed';
      analytics.log(EVENTS.notificationResult, { result: code, where }, { kind: 'click' });
      setBlocker(code);
      return false;
    } finally {
      setAsking(false);
    }

    // 앞서 못 켠 이유를 지운다. 남겨 두면 켜진 토글 아래에서 못 켰다고 말하게 된다.
    setBlocker(null);
    save.mutate({
      is_enabled: true,
      frequency: 'daily',
      ...(remindAt == null || remindAt === '' ? {} : { remind_at: remindAt }),
    });
    return true;
  }

  function turnOff(): void {
    setBlocker(null);
    save.mutate({ is_enabled: false });
  }

  return {
    busy: asking || save.isPending,
    blocker,
    supported,
    saveError: save.error,
    save,
    turnOn,
    turnOff,
    clearBlocker: () => setBlocker(null),
  };
}

/**
 * 토스 콘솔 스마트발송 템플릿 코드.
 *
 * 운영 값은 빌드 환경변수로만 들어온다. 비어 있으면 브릿지가 개발에서만 통과시키고
 * 그 밖에서는 못 쓰는 기능으로 다룬다. `import.meta.env.VITE_...` 는 vite 가 빌드 때
 * 문자열로 갈아 끼우므로 키를 변수로 만들지 않는다.
 */
function templateCode(): string {
  const configured = import.meta.env.VITE_NOTIFICATION_TEMPLATE_CODE;
  return typeof configured === 'string' ? configured.trim() : '';
}
