import { Link } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { ROUTES } from '../app/router/routes';
import { KeepDataCard } from '../features/account';
import { AdSlot } from '../features/ads';
import { AssetsEntryCard } from '../features/assets';
import { BudgetSection } from '../features/budgets';
import { useBooks, useSharedBooksEnabled } from '../shared/api';
import { Card, CategoryAvatar, type IconName } from '../shared/ui';

interface SubScreen {
  to: string;
  label: string;
  icon: IconName;
}

/**
 * 관리 탭 아래에 달린 화면들. 순서가 곧 화면에 보이는 순서다.
 *
 * **들어가는 길에 광고를 세우지 않는다(ADR-0039).** 목표·카테고리·태그·반복 지출은
 * 쓰는 사람이 원래 열던 기능이라, 그 앞을 광고가 막으면 받는 것 없이 치르는 통행료가 된다.
 * 토스 노출 정책의 UX 원칙 2(추가 광고는 더 자세한 정보나 보상이 있을 때만)에 걸린다.
 *
 * 알림 설정은 여기와 앱 설정 두 곳에 있다. 켜려는 사람이 어느 쪽을 먼저 뒤질지
 * 갈려서 한 곳만 두면 못 찾는다.
 */
const SUB_SCREENS: SubScreen[] = [
  { to: ROUTES.goal, label: '목표', icon: '02_gold_bars' },
  { to: ROUTES.categories, label: '카테고리 관리', icon: '16_paw' },
  { to: ROUTES.tags, label: '태그', icon: '05_choice_arrows' },
  { to: ROUTES.recurring, label: '반복 지출', icon: '27_clock' },
  { to: ROUTES.notifications, label: '알림 설정', icon: '30_bell' },
  { to: ROUTES.account, label: '내 계정', icon: '57_smartphone' },
  { to: ROUTES.settings, label: '앱 설정', icon: '21_shield' },
];

/**
 * 같이 쓰는 가계부 입구. 서버가 기능을 열었을 때만 선다.
 *
 * **아래 목록에 넣지 않고 맨 위 카드 한 줄로 둔다.** 목록 맨 위에 두었더니 예산 카드 아래라
 * 탭바에 가려, 관리 탭을 열어서는 안 보였다. 새로 생긴 기능을 찾는 사람은 내려 보지 않는다.
 */
function BooksEntryCard() {
  const books = useBooks();
  const count = books.data?.items.length ?? 0;

  return (
    <Card padding="list" className="manage-books">
      <Link className="link-row" to={ROUTES.books}>
        <CategoryAvatar icon="59_people" size={44} />
        <span className="link-row__label">같이 쓰는 가계부</span>
        {count > 0 ? <span className="link-row__value">{count}개</span> : null}
      </Link>
    </Card>
  );
}

/** 관리 탭. 자산과 예산을 여기서 바로 보고, 나머지는 하위 화면으로 들어간다. */
export default function ManagePage() {
  const booksEnabled = useSharedBooksEnabled();

  return (
    <div className="page">
      <h1 className="page__title">관리</h1>
      <p className="page__lead">예산과 분류를 손봐요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 예산 자리가 계속 회색이다. */}
      <IdentityNotice />

      {booksEnabled ? <BooksEntryCard /> : null}

      <AssetsEntryCard />

      <BudgetSection />

      {/*
        배너는 예산 바로 아래다(사용자 지시). 맨 끝에 두면 하위 화면 목록 밑이라 화면을
        끝까지 내려야 보였다. 예산과 목록 사이에 서지만 둘 다 따로 누르는 자리라 흐름은 안 끊긴다.
      */}
      <AdSlot placement="manage" />

      {/*
        「내 계정」 은 아래 목록 안에 있어 아무도 스스로 들어가지 않는다. 쌓아 둔 것이
        있는 사람에게만, 이 기기에서 한 번만, 목록 바로 위에서 말한다.
      */}
      <KeepDataCard />

      <nav aria-label="관리 하위 화면">
        <Card padding="list">
          <ul className="link-rows">
            {SUB_SCREENS.map((screen) => (
              <li key={screen.to}>
                <Link className="link-row" to={screen.to}>
                  <CategoryAvatar icon={screen.icon} size={44} />
                  <span className="link-row__label">{screen.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </nav>
    </div>
  );
}
