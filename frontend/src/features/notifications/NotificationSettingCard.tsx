import { useId, useState } from 'react';

import { useBridge } from '../../app/providers';
import {
  ApiError,
  useNotificationSettings,
  useSaveNotificationSettings,
  type NotificationSettingsPatch,
} from '../../shared/api';
import { BridgeError } from '../../shared/toss';
import { RetryButton, Toggle, UnsupportedFeature } from '../../shared/ui';

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

/** 켤 수 없게 된 이유. 화면이 무엇을 말할지 여기서 갈린다. */
type Blocker = 'unsupported' | 'rejected' | 'failed';

const BLOCKER_NOTICE: Record<Exclude<Blocker, 'unsupported'>, string> = {
  rejected: '토스 알림 동의를 하지 않아 알림을 켤 수 없어요. 토스 앱 알림 설정에서 바꿀 수 있어요.',
  failed: '알림 동의를 받지 못했어요. 잠시 후 다시 시도해 주세요.',
};

/**
 * 기록 알림을 켜고 시간을 정하는 자리.
 *
 * 켜는 그 순간에만 토스 알림 동의를 묻는다. 화면에 들어오자마자 묻지 않는다.
 * 거절도 결과의 한 종류라 실패로 다루지 않고, **다시 묻지 않는다.** 눌러도 계속 동의 창이
 * 뜨면 거절한 사람에게 같은 것을 반복해서 묻게 된다.
 *
 * 아직 설정을 못 받았으면 아무것도 그리지 않는다. 기본값으로 그려 두면 꺼져 있는 것을
 * 켜져 있다고 말하게 된다. 다만 **실패는 감추지 않는다.**
 */
export function NotificationSettingCard() {
  const titleId = useId();
  const timeId = useId();
  const bridge = useBridge();
  const settings = useNotificationSettings();
  const save = useSaveNotificationSettings();

  const [blocker, setBlocker] = useState<Blocker | null>(() =>
    bridge.supports('notification') ? null : 'unsupported',
  );
  const [asking, setAsking] = useState(false);
  // 서버 값이 오기 전에 고친 시각. 저장이 끝나면 서버 값으로 되돌린다.
  const [draftTime, setDraftTime] = useState<string | null>(null);

  if (blocker === 'unsupported') {
    return <UnsupportedFeature feature="기록 알림" />;
  }

  if (settings.isError) {
    return (
      <div className="notify-fail">
        <span className="notify-fail__text">알림 설정을 불러오지 못했어요</span>
        <RetryButton variant="ghost" onRetry={() => void settings.refetch()} />
      </div>
    );
  }

  const current = settings.data;
  if (current == null) return null;

  const enabled = current.is_enabled;
  const time = draftTime ?? current.remind_at ?? '';
  const busy = asking || save.isPending;

  const failure =
    save.error instanceof ApiError
      ? save.error.message
      : save.isError
        ? '알림 설정을 저장하지 못했어요.'
        : null;

  function patch(body: NotificationSettingsPatch): void {
    save.mutate(body, { onSuccess: () => setDraftTime(null) });
  }

  async function turnOn(): Promise<void> {
    setAsking(true);
    try {
      const result = await bridge.requestNotificationAgreement(templateCode());
      if (result === 'agreementRejected') {
        setBlocker('rejected');
        return;
      }
    } catch (error) {
      setBlocker(
        error instanceof BridgeError && error.code === 'UNSUPPORTED' ? 'unsupported' : 'failed',
      );
      return;
    } finally {
      setAsking(false);
    }

    // 정해 둔 시각이 없으면 보내지 않는다. 그때는 서버가 기본 시각을 넣어 준다.
    patch({
      is_enabled: true,
      frequency: 'daily',
      ...(time === '' ? {} : { remind_at: time }),
    });
  }

  function toggle(next: boolean): void {
    if (next) {
      void turnOn();
      return;
    }
    setBlocker(null);
    patch({ is_enabled: false });
  }

  function changeTime(next: string): void {
    setDraftTime(next);
    // 시각 입력은 다 채워지기 전까지 빈 문자열을 준다. 반쪽 값을 저장하지 않는다.
    if (next === '') return;
    patch({ remind_at: next });
  }

  return (
    <section className="notify" aria-labelledby={titleId}>
      <div className="notify__row">
        <div className="notify__text">
          <span id={titleId} className="notify__title">
            기록 알림
          </span>
          <span className="notify__desc">매일 정한 시간에 기록을 떠올릴 수 있게 알려요.</span>
        </div>
        <Toggle
          checked={enabled}
          // 거절한 뒤에는 눌러도 동의 창이 다시 뜨지 않는다. 이 화면을 나갔다 오면 다시 물을 수 있다.
          disabled={busy || blocker === 'rejected'}
          ariaLabelledBy={titleId}
          onChange={toggle}
        />
      </div>

      <div className="notify__time">
        <label className="notify__time-label" htmlFor={timeId}>
          알림 시간
        </label>
        <input
          id={timeId}
          className="notify__time-input"
          type="time"
          value={time}
          disabled={!enabled || busy}
          onChange={(event) => changeTime(event.target.value)}
        />
      </div>

      {blocker != null ? (
        <p className="notify__notice" role="alert">
          {BLOCKER_NOTICE[blocker]}
        </p>
      ) : null}

      {/* 저장이 막히면 토글이 원래 자리로 돌아간다. 왜 돌아갔는지 여기서 말한다. */}
      {failure ? (
        <p className="notify__notice" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
