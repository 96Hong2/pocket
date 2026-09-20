import { useEffect, useState } from 'react';

import { useBridge, useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { useMe } from '../../shared/api';
import { BottomSheet, Button } from '../../shared/ui';
import { EmailLinkSheet } from '../account';

/** 이 기기에서 한 번만 묻는다. 축하 뒤에 같은 말이 매주 서면 그때부터 축하가 아니다. */
const ASKED_KEY = 'streak-keep-asked';

/**
 * 7일 축하를 닫은 바로 뒤에 한 번 뜨는 작은 창.
 *
 * **여기가 이 앱에서 계정을 권할 수 있는 거의 유일한 순간이다.** 일주일치를 쌓아 둔
 * 사람이, 방금 그걸 잘했다는 말을 들은 참이다. 지킬 것이 생겼다는 것을 스스로 아는
 * 자리라, 그 전에 물으면 「가입부터 시키는 앱」 이 되고 그 뒤에 물으면 늦다.
 *
 * 조건은 관리 탭의 [[KeepDataCard]] 와 같다. 아직 이메일을 안 붙였고, 메일을 보낼 수단이
 * 운영에 붙어 있을 때만 뜬다. 없는데 띄우면 눌러 봐야 「준비 중」 이다.
 *
 * 누르면 **그 자리에서** 이메일 칸이 열린다. 관리 탭으로 보내면 거기까지 가는 동안
 * 방금 받은 축하가 식는다.
 */
export function StreakKeepPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const me = useMe();
  /** 이 기기에서 이미 물었나. 읽기 전에는 null 이라 아무것도 안 그린다. */
  const [asked, setAsked] = useState<boolean | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void bridge.storage
      .get(ASKED_KEY)
      .catch(() => null)
      .then((value) => {
        if (alive) setAsked(value != null);
      });
    return () => {
      alive = false;
    };
  }, [bridge, open]);

  const linkable = me.data != null && me.data.email == null && me.data.email_login_available;
  const show = open && asked === false && linkable && !linkOpen;

  /*
    시스템 뒤로가기를 이 창이 가져간다.

    **빼먹으면 앱이 통째로 닫힌다.** 홈은 탭 뿌리라, 열린 오버레이가 없으면 뒤로가기가
    미니앱을 닫는다. 바텀시트는 스스로 등록하지 않으므로 여는 쪽이 매번 건다.
  */
  useOverlayBackClose(show, onClose);

  // 뜬 그 순간에 물었다고 적는다. 대답을 기다려 적으면 그냥 닫은 사람에게 매주 다시 뜬다.
  useEffect(() => {
    if (!show) return;
    void bridge.storage.set(ASKED_KEY, '1').catch(() => undefined);
    analytics.log(
      EVENTS.accountLinkResult,
      { result: 'prompt_shown', where: 'streak' },
      { kind: 'impression' },
    );
  }, [analytics, bridge, show]);

  return (
    <>
      <BottomSheet
        open={show}
        onClose={() => {
          analytics.log(
            EVENTS.accountLinkResult,
            { result: 'prompt_dismissed', where: 'streak' },
            { kind: 'click' },
          );
          onClose();
        }}
        title="기록을 안전하게"
      >
        <p className="streak-keep__body">이메일을 등록하면 내 기록을 안전하게 저장할 수 있어요!</p>
        {/* 무엇이 걸려 있는지 한 줄로 밝힌다. 지금은 이 기기에만 있다는 사실이 권유의 전부다. */}
        <p className="streak-keep__note">
          지금은 이 기기에만 있어요. 기기를 바꾸면 일주일치가 함께 사라져요
        </p>
        <Button
          fullWidth
          onClick={() => {
            analytics.log(
              EVENTS.accountLinkResult,
              { result: 'prompt_opened', where: 'streak' },
              { kind: 'click' },
            );
            setLinkOpen(true);
          }}
        >
          이메일 등록하기
        </Button>
        <button type="button" className="streak-keep__later" onClick={onClose}>
          나중에 할게요
        </button>
      </BottomSheet>

      <EmailLinkSheet
        open={linkOpen}
        onClose={() => {
          setLinkOpen(false);
          onClose();
        }}
        onLinked={() => {
          setLinkOpen(false);
          onClose();
        }}
      />
    </>
  );
}
