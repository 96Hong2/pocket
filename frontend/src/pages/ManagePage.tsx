import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { ROUTES } from '../app/router/routes';
import { KeepDataCard } from '../features/account';
import { AdAheadListNote, AdSlot, useInterstitial, type InterstitialWhere } from '../features/ads';
import { AssetsEntryCard } from '../features/assets';
import { BudgetSection } from '../features/budgets';
import { Card, CategoryAvatar, type IconName } from '../shared/ui';

interface SubScreen {
  to: string;
  label: string;
  icon: IconName;
  /**
   * 들어가는 길에 전면 광고 한 편이 서는 자리. 없으면 곧바로 넘어간다.
   *
   * 알림 설정·내 계정·앱 설정에는 두지 않는다. 알림을 켜러 온 사람과 기록을 안전하게
   * 옮기러 온 사람을 광고로 막으면, 그 둘은 이 앱이 계속 쓰이게 하는 바로 그 길이다.
   */
  ad?: InterstitialWhere;
}

/**
 * 관리 탭 아래에 달린 화면들. 순서가 곧 화면에 보이는 순서다.
 *
 * **광고가 서는 넷을 위로 모았다.** 예고를 줄마다 반복하지 않고 목록 머리에 한 줄만
 * 두려면, 그 한 줄이 가리키는 것들이 붙어 있어야 한다. 흩어 두면 어느 줄이 해당하는지
 * 알 길이 없어 예고가 예고 구실을 못 한다.
 *
 * 알림 설정은 여기와 앱 설정 두 곳에 있다. 켜려는 사람이 어느 쪽을 먼저 뒤질지
 * 갈려서 한 곳만 두면 못 찾는다.
 */
const SUB_SCREENS: SubScreen[] = [
  { to: ROUTES.goal, label: '목표', icon: '02_gold_bars', ad: 'goal' },
  { to: ROUTES.categories, label: '카테고리 관리', icon: '16_paw', ad: 'categories' },
  { to: ROUTES.tags, label: '태그', icon: '05_choice_arrows', ad: 'tags' },
  { to: ROUTES.recurring, label: '반복 지출', icon: '27_clock', ad: 'recurring' },
  { to: ROUTES.notifications, label: '알림 설정', icon: '30_bell' },
  { to: ROUTES.account, label: '내 계정', icon: '57_smartphone' },
  { to: ROUTES.settings, label: '앱 설정', icon: '21_shield' },
];

/** 광고가 서는 줄과 그렇지 않은 줄. 머리글 한 줄이 가리키는 범위가 눈으로도 갈려야 한다. */
const AD_ROWS = SUB_SCREENS.filter((screen) => screen.ad != null);
const PLAIN_ROWS = SUB_SCREENS.filter((screen) => screen.ad == null);

/** 예고 한 줄과 그 줄이 가리키는 버튼들을 잇는 이름. */
const AD_NOTE_ID = 'manage-ad-note';

/** 관리 탭. 자산과 예산을 여기서 바로 보고, 나머지는 하위 화면으로 들어간다. */
export default function ManagePage() {
  const navigate = useNavigate();
  const interstitial = useInterstitial();
  /*
    지금 어느 줄을 눌러 기다리는 중인가.

    **누르고 나서 최대 8초 동안 아무 일도 안 일어나던 자리다.** 광고를 불러오는 데 그만큼
    걸리는데 화면은 그대로여서, 한 번 더 누르거나 먹통으로 여기고 나갔다. 누른 줄에만
    표시를 낸다. 화면 전체를 덮으면 그것대로 광고가 시작된 줄 안다.
  */
  const [waiting, setWaiting] = useState<string | null>(null);

  /*
    광고가 뜨든 안 뜨든 화면은 열린다. 광고 서버 사정으로 카테고리를 못 고치게 두지 않는다.
    같은 세션에서 두 번째 줄을 누르면 상한에 걸려 그냥 지나간다.
  */
  async function open(screen: SubScreen): Promise<void> {
    if (screen.ad == null) return;
    setWaiting(screen.to);
    try {
      await interstitial.show(screen.ad);
    } finally {
      setWaiting(null);
    }
    void navigate(screen.to);
  }

  /**
   * 한 줄.
   *
   * **광고가 서는 줄만 버튼이다.** 들어가는 순서를 화면이 쥐어야 광고를 먼저 세울 수 있다.
   * 나머지 셋은 링크 그대로 둔다. 전부 버튼으로 만들면 이 nav 에 링크가 하나도 없어
   * 스크린리더의 링크 목록에서 통째로 사라지고, 광고와 무관한 줄까지 함께 잠긴다.
   */
  function row(screen: SubScreen) {
    if (screen.ad == null) {
      return (
        <li key={screen.to}>
          <Link className="link-row" to={screen.to}>
            <CategoryAvatar icon={screen.icon} size={44} />
            <span className="link-row__label">{screen.label}</span>
          </Link>
        </li>
      );
    }
    const busy = waiting === screen.to;
    return (
      <li key={screen.to}>
        <button
          type="button"
          className="link-row"
          // 예고 한 줄이 이 줄들을 가리킨다는 것을 눈이 아니라 표시로도 묶어 둔다.
          aria-describedby={interstitial.ready ? AD_NOTE_ID : undefined}
          aria-busy={busy}
          disabled={waiting != null}
          onClick={() => void open(screen)}
        >
          <CategoryAvatar icon={screen.icon} size={44} />
          <span className="link-row__label">{screen.label}</span>
          {busy ? <span className="link-row__waiting">잠시만요</span> : null}
        </button>
      </li>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">관리</h1>
      <p className="page__lead">예산과 분류를 손봐요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 예산 자리가 계속 회색이다. */}
      <IdentityNotice />

      <AssetsEntryCard />

      <BudgetSection />

      {/*
        「내 계정」 은 아래 목록 안에 있어 아무도 스스로 들어가지 않는다. 쌓아 둔 것이
        있는 사람에게만, 이 기기에서 한 번만, 목록 바로 위에서 말한다.
      */}
      <KeepDataCard />

      <nav aria-label="관리 하위 화면">
        <Card padding="list">
          {/*
            오늘 상한을 이미 채웠으면 글자를 지운다. 안 뜰 광고를 적어 두면 그건 예고가 아니다.
            다만 **자리는 남긴다.** DOM 에서 빼면 아래 일곱 줄이 통째로 위로 뛴다.
          */}
          <AdAheadListNote
            id={AD_NOTE_ID}
            count={AD_ROWS.length}
            className={`link-rows__ad${interstitial.ready ? '' : ' link-rows__ad--off'}`}
          />
          <ul className="link-rows">{AD_ROWS.map(row)}</ul>
          {/* 예고가 가리키는 범위는 여기서 끝난다. 글자 대신 한 칸 띄워서 말한다. */}
          <ul className="link-rows link-rows--rest">{PLAIN_ROWS.map(row)}</ul>
        </Card>
      </nav>

      {/*
        배너는 화면 맨 끝이다. 예산과 하위 화면 사이에 두면 할 일 흐름을 끊는다.
        이 화면은 모드에 따라 갈리지 않아 늘 같은 자리다.
      */}
      <AdSlot placement="manage" />
    </div>
  );
}
