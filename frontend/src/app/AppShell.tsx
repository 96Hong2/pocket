import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { LoadingState, iconUrl, type IconName } from '../shared/ui';

import { ROUTES, SCREEN_TITLES, isTabRoot } from './router/routes';

interface TabItem {
  to: string;
  label: string;
  icon: IconName;
}

const TABS: TabItem[] = [
  { to: ROUTES.home, label: '홈', icon: '04_home' },
  { to: ROUTES.report, label: '리포트', icon: '03_growth_chart' },
  { to: ROUTES.manage, label: '관리', icon: '23_document' },
];

function TabBar() {
  return (
    <nav className="tabbar" aria-label="주요 화면">
      <div className="tabbar__inner">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end className="tabbar__item">
            <img
              className="tabbar__icon"
              src={iconUrl(tab.icon)}
              alt=""
              aria-hidden="true"
            />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/**
 * 앱 레이아웃.
 * 상단바는 플랫폼이 그리므로 여기서 그리지 않는다. 제목은 document.title 로 넘긴다.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const showTabBar = isTabRoot(pathname);

  useEffect(() => {
    document.title = SCREEN_TITLES[pathname] ?? '10초 가계부';
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="shell">
      <div
        className={`shell__content ${showTabBar ? 'shell__content--with-tabbar' : 'shell__content--plain'}`}
      >
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </div>
      {showTabBar && <TabBar />}
    </div>
  );
}
