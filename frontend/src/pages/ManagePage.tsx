import { Link } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { ROUTES } from '../app/router/routes';
import { AssetsEntryCard } from '../features/assets';
import { BudgetSection } from '../features/budgets';
import { Card, CategoryAvatar, type IconName } from '../shared/ui';

/**
 * 관리 탭 아래에 달린 화면들. 순서가 곧 화면에 보이는 순서다.
 *
 * 알림 설정은 여기와 앱 설정 두 곳에 있다. 켜려는 사람이 어느 쪽을 먼저 뒤질지
 * 갈려서 한 곳만 두면 못 찾는다.
 */
const SUB_SCREENS: { to: string; label: string; icon: IconName }[] = [
  { to: ROUTES.goal, label: '목표', icon: '02_gold_bars' },
  { to: ROUTES.categories, label: '카테고리 관리', icon: '16_paw' },
  { to: ROUTES.notifications, label: '알림 설정', icon: '30_bell' },
  { to: ROUTES.settings, label: '앱 설정', icon: '21_shield' },
];

/** 관리 탭. 자산과 예산을 여기서 바로 보고, 나머지는 하위 화면으로 들어간다. */
export default function ManagePage() {
  return (
    <div className="page">
      <h1 className="page__title">관리</h1>
      <p className="page__lead">예산과 분류를 손봐요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 예산 자리가 계속 회색이다. */}
      <IdentityNotice />

      <AssetsEntryCard />

      <BudgetSection />

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
