import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useSaveProfile, type AgeBand, type Gender, type MeOut } from '../../shared/api';
import { cx } from '../../shared/lib/cx';
import { BottomSheet, Button } from '../../shared/ui';

export interface ProfileSheetProps {
  open: boolean;
  me: MeOut;
  onClose: () => void;
}

const AGE_BANDS: { value: AgeBand; label: string }[] = [
  { value: '10s', label: '10대' },
  { value: '20s', label: '20대' },
  { value: '30s', label: '30대' },
  { value: '40s', label: '40대' },
  { value: '50s', label: '50대' },
  { value: '60s_plus', label: '60대 이상' },
];

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
  { value: 'undisclosed', label: '말하지 않을래요' },
];

/** 카드 한 줄에 적을 요약. 둘 다 없으면 「아직 안 적었어요」. */
export function describeProfile(me: MeOut): string {
  const age = AGE_BANDS.find((item) => item.value === me.age_band)?.label;
  const gender = GENDERS.find((item) => item.value === me.gender)?.label;
  const parts = [age, gender === '말하지 않을래요' ? undefined : gender].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '아직 안 적었어요';
}

/**
 * 연령대·성별. 딱 둘만 묻고, **건너뛰기가 늘 있다.**
 *
 * 이메일을 붙인 직후 한 번 뜬다. 둘 다 안 골라도 되고 건너뛰면 다시 묻지 않는다.
 * 무엇에 쓰는지 한 줄로 밝힌다. 이유 없이 묻는 칸은 그 자리에서 사람을 내보낸다.
 */
export function ProfileSheet({ open, me, onClose }: ProfileSheetProps) {
  const [busy, setBusy] = useState(false);
  useOverlayBackClose(open, onClose, busy);

  return (
    <BottomSheet open={open} onClose={onClose} dismissible={!busy} title="두 가지만 알려 주세요">
      {open ? <ProfileForm me={me} onBusyChange={setBusy} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function ProfileForm({
  me,
  onBusyChange,
  onDone,
}: {
  me: MeOut;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const analytics = useAnalytics();
  const save = useSaveProfile();
  const [ageBand, setAgeBand] = useState<AgeBand | null>(me.age_band ?? null);
  const [gender, setGender] = useState<Gender | null>(me.gender ?? null);
  const message = save.error instanceof ApiError ? save.error.message : null;

  function submit(skip: boolean): void {
    onBusyChange(true);
    const body = skip ? {} : { age_band: ageBand, gender };
    save.mutate(body, {
      onSettled: () => onBusyChange(false),
      onSuccess: () => {
        analytics.log(
          EVENTS.profileResult,
          skip
            ? { result: 'skipped' }
            : { result: 'saved', age_band: ageBand ?? 'none', gender: gender ?? 'none' },
          { kind: 'click' },
        );
        onDone();
      },
    });
  }

  return (
    <div className="account-form">
      <p className="account-form__lead">
        또래는 어디에 얼마나 쓰는지 알려 드릴 때 써요. 안 알려 주셔도 괜찮아요.
      </p>

      <fieldset className="account-form__group">
        <legend className="account-form__label">연령대</legend>
        <div className="account-form__chips" role="radiogroup" aria-label="연령대">
          {AGE_BANDS.map((item) => (
            <ChoiceChip
              key={item.value}
              label={item.label}
              on={ageBand === item.value}
              onPick={() => setAgeBand(ageBand === item.value ? null : item.value)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="account-form__group">
        <legend className="account-form__label">성별</legend>
        <div className="account-form__chips" role="radiogroup" aria-label="성별">
          {GENDERS.map((item) => (
            <ChoiceChip
              key={item.value}
              label={item.label}
              on={gender === item.value}
              onPick={() => setGender(gender === item.value ? null : item.value)}
            />
          ))}
        </div>
      </fieldset>

      {message ? (
        <p className="account-form__notice" role="alert">
          {message}
        </p>
      ) : null}

      <Button fullWidth disabled={save.isPending} onClick={() => submit(false)}>
        저장
      </Button>
      <button
        type="button"
        className="account-form__again"
        disabled={save.isPending}
        onClick={() => submit(true)}
      >
        건너뛰기
      </button>
    </div>
  );
}

function ChoiceChip({ label, on, onPick }: { label: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={cx('account-chip', on && 'account-chip--on')}
      onClick={onPick}
    >
      {label}
    </button>
  );
}
