import { Link } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { ROUTES } from '../app/router/routes';
import { BudgetSection } from '../features/budgets';
import { MerchantRuleList } from '../features/imports';
import { Card } from '../shared/ui';

/**
 * 관리 탭 아래에 달린 화면들. 순서가 곧 화면에 보이는 순서다.
 *
 * **자산·목표는 여기 없다.** 라우트는 있지만 화면은 아직 점선 자리표시자라, 입구를 두면
 * 눌러 들어간 사람이 "P1 화면이에요" 만 보고 되돌아 나온다. 심사에서도 빈 화면은 사유가 된다.
 * 알림 설정을 같은 이유로 이미 걷어 냈다. 세 화면이 실물이 되면 그때 함께 되돌린다.
 */
const SUB_SCREENS = [
  { to: ROUTES.categories, label: '카테고리 관리' },
  { to: ROUTES.settings, label: '앱 설정' },
] as const;

/** 관리 탭. 예산을 여기서 바로 고치고, 나머지는 하위 화면으로 들어간다. */
export default function ManagePage() {
  return (
    <div className="page">
      <h1 className="page__title">관리</h1>
      <p className="page__lead">예산과 분류를 손봐요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 예산 자리가 계속 회색이다. */}
      <IdentityNotice />

      <BudgetSection />

      <MerchantRuleList />

      <nav aria-label="관리 하위 화면">
        <Card padding="list">
          <ul className="link-rows">
            {SUB_SCREENS.map((screen) => (
              <li key={screen.to}>
                <Link className="link-row" to={screen.to}>
                  {screen.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </nav>
    </div>
  );
}
