import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useSaveProfile, type AgeBand, type Gender, type MeOut } from '../../shared/api';
import { cx } from '../../shared/lib/cx';
import { BottomSheet, Button, Select } from '../../shared/ui';

import { AGE_BANDS, GENDERS } from './profileOptions';

export interface ProfileSheetProps {
  open: boolean;
  me: MeOut;
  onClose: () => void;
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

      {/* 처음 안내와 같은 모양이어야 한다. 같은 값을 고치는 자리가 둘인데 생김새가 다르면 헷갈린다. */}
      <Select
        label="연령대"
        placeholder="안 고를래요"
        options={AGE_BANDS}
        value={ageBand}
        disabled={save.isPending}
        onChange={setAgeBand}
      />

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
