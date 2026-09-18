import { useId, useState } from 'react';

import { useBridge } from '../../app/providers';
import { ApiError, useNotificationSettings } from '../../shared/api';
import { CategoryAvatar, RetryButton, Toggle, UnsupportedFeature } from '../../shared/ui';

import { REMIND_BLOCKER_NOTICE, unsupportedNotice, useRemindOptIn } from './useRemindOptIn';

/**
 * 기록 알림을 켜고 시간을 정하는 자리.
 *
 * 켜고 끄는 절차는 `useRemindOptIn` 이 갖고 있다. 홈의 권유 카드도 같은 것을 부른다.
 *
 * 아직 설정을 못 받았으면 아무것도 그리지 않는다. 기본값으로 그려 두면 꺼져 있는 것을
 * 켜져 있다고 말하게 된다. 다만 **실패는 감추지 않는다.**
 */
export function NotificationSettingCard() {
  const titleId = useId();
  const timeId = useId();
  const bridge = useBridge();
  const settings = useNotificationSettings();
  const remind = useRemindOptIn('settings');
  // 서버 값이 오기 전에 고친 시각. 저장이 끝나면 서버 값으로 되돌린다.
  const [draftTime, setDraftTime] = useState<string | null>(null);

  if (remind.blocker === 'unsupported') {
    return <UnsupportedFeature feature="기록 알림" description={unsupportedNotice(bridge)} />;
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
  const busy = remind.busy;

  const failure =
    remind.saveError instanceof ApiError
      ? remind.saveError.message
      : remind.saveError != null
        ? '알림 설정을 저장하지 못했어요.'
        : null;

  function toggle(next: boolean): void {
    if (next) {
      // 정해 둔 시각이 없으면 안 보낸다. 그때는 서버가 기본 시각을 넣어 준다.
      void remind.turnOn(time === '' ? undefined : time).then(() => setDraftTime(null));
      return;
    }
    remind.turnOff();
  }

  function changeTime(next: string): void {
    setDraftTime(next);
    // 시각 입력은 다 채워지기 전까지 빈 문자열을 준다. 반쪽 값을 저장하지 않는다.
    if (next === '') return;
    remind.save.mutate({ remind_at: next }, { onSuccess: () => setDraftTime(null) });
  }

  return (
    <section className="notify" aria-labelledby={titleId}>
      <div className="notify__row">
        <CategoryAvatar icon="30_bell" size={54} />
        <div className="notify__text">
          <span id={titleId} className="notify__title">
            기록 알림
          </span>
          <span className="notify__desc">매일 정한 시간에 한 번 알려 드려요.</span>
        </div>
        <Toggle
          checked={enabled}
          // 거절한 뒤에는 눌러도 동의 창이 다시 뜨지 않는다. 이 화면을 나갔다 오면 다시 물을 수 있다.
          disabled={busy || remind.blocker === 'rejected'}
          ariaLabelledBy={titleId}
          onChange={toggle}
        />
      </div>

      <div className="notify__time">
        <CategoryAvatar icon="27_clock" size={54} />
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

      {remind.blocker != null ? (
        <p className="notify__notice" role="alert">
          {REMIND_BLOCKER_NOTICE[remind.blocker]}
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
