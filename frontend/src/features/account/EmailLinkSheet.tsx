import { useId, useState, type FormEvent } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useStartEmailLogin, useVerifyEmailLogin, type MeOut } from '../../shared/api';
import { BottomSheet, Button } from '../../shared/ui';

export interface EmailLinkSheetProps {
  open: boolean;
  onClose: () => void;
  /** 붙이고 나서. 옮겨 갔으면(다른 기기의 사람) 화면이 통째로 그 사람 것으로 바뀐다. */
  onLinked: (me: MeOut) => void;
}

/** 주소 모양만 본다. 진짜 있는지는 코드가 오는지로 안다. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * 이메일로 지켜 두기. 두 단이다. 주소 → 코드.
 *
 * 한 화면에서 끝낸다. 메일 앱으로 갔다 오는 사이 시트가 닫히면 처음부터다.
 * 코드 칸은 숫자 여섯 자리 하나다. 칸 여섯 개로 쪼개면 붙여 넣기가 안 된다.
 */
export function EmailLinkSheet({ open, onClose, onLinked }: EmailLinkSheetProps) {
  const [busy, setBusy] = useState(false);
  useOverlayBackClose(open, onClose, busy);

  return (
    <BottomSheet open={open} onClose={onClose} dismissible={!busy} title="이메일로 지켜 두기">
      {open ? <LinkForm onBusyChange={setBusy} onLinked={onLinked} /> : null}
    </BottomSheet>
  );
}

type Step = 'email' | 'code';

function LinkForm({
  onBusyChange,
  onLinked,
}: {
  onBusyChange: (busy: boolean) => void;
  onLinked: (me: MeOut) => void;
}) {
  const analytics = useAnalytics();
  const emailId = useId();
  const codeId = useId();
  const start = useStartEmailLogin();
  const verify = useVerifyEmailLogin();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const busy = start.isPending || verify.isPending;
  const startMessage = start.error instanceof ApiError ? start.error.message : null;
  const verifyMessage = verify.error instanceof ApiError ? verify.error.message : null;
  const verifyCode = verify.error instanceof ApiError ? verify.error.code : null;

  function send(event: FormEvent): void {
    event.preventDefault();
    if (!looksLikeEmail(email)) return;
    onBusyChange(true);
    start.mutate(email.trim(), {
      onSettled: () => onBusyChange(false),
      onSuccess: () => {
        analytics.log(EVENTS.accountLinkResult, { result: 'sent' }, { kind: 'click' });
        setCode('');
        setStep('code');
      },
      onError: (cause) => {
        analytics.log(
          EVENTS.accountLinkResult,
          { result: 'send_failed', error_code: cause instanceof ApiError ? cause.code : 'unknown' },
          { kind: 'click' },
        );
      },
    });
  }

  function confirm(event: FormEvent): void {
    event.preventDefault();
    if (code.length !== 6) return;
    onBusyChange(true);
    verify.mutate(
      { email: email.trim(), code },
      {
        onSettled: () => onBusyChange(false),
        onSuccess: (result) => {
          analytics.log(EVENTS.accountLinkResult, { result: result.result }, { kind: 'click' });
          onLinked(result.me);
        },
        onError: (cause) => {
          analytics.log(
            EVENTS.accountLinkResult,
            {
              result: 'verify_failed',
              error_code: cause instanceof ApiError ? cause.code : 'unknown',
            },
            { kind: 'click' },
          );
        },
      },
    );
  }

  if (step === 'email') {
    return (
      <form className="account-form" onSubmit={send}>
        <p className="account-form__lead">코드를 보내 드릴게요. 비밀번호는 만들지 않아요.</p>
        <label className="account-form__label" htmlFor={emailId}>
          이메일
        </label>
        <input
          id={emailId}
          className="account-form__input"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
        {startMessage ? (
          <p className="account-form__notice" role="alert">
            {startMessage}
          </p>
        ) : null}
        <Button type="submit" fullWidth disabled={!looksLikeEmail(email) || busy}>
          {start.isPending ? '보내는 중이에요' : '코드 받기'}
        </Button>
      </form>
    );
  }

  return (
    <form className="account-form" onSubmit={confirm}>
      <p className="account-form__lead">
        <b>{email.trim()}</b> 으로 보냈어요. 메일에 적힌 숫자 여섯 자리를 적어 주세요.
      </p>
      <label className="account-form__label" htmlFor={codeId}>
        확인 코드
      </label>
      <input
        id={codeId}
        className="account-form__input account-form__input--code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        disabled={busy}
      />
      {verifyMessage ? (
        <p className="account-form__notice" role="alert">
          {verifyMessage}
        </p>
      ) : null}
      <Button type="submit" fullWidth disabled={code.length !== 6 || busy}>
        {verify.isPending ? '확인하는 중이에요' : '확인'}
      </Button>
      {/* 만료됐거나 메일이 안 왔으면 다시 받는다. 처음으로 돌아가지 않고 여기서 바로. */}
      <button
        type="button"
        className="account-form__again"
        disabled={busy}
        onClick={() => {
          verify.reset();
          setStep('email');
        }}
      >
        {verifyCode === 'LOGIN_CODE_EXPIRED' ? '새 코드 받기' : '메일이 안 왔어요 · 다시 보내기'}
      </button>
    </form>
  );
}
