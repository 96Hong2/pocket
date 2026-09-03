import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { LoadingState, iconUrl, type IconName } from '../shared/ui';

import { ErrorBoundary } from './ErrorBoundary';
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
        {/*
          화면 하나가 죽어도 탭바와 뒤로가기는 살아 있어야 한다.
          바깥 바운더리만 두면 리포트 화면 하나 때문에 앱이 통째로 크래시 화면이 되고,
          거기서는 홈으로 돌아갈 방법이 없다. key 로 화면을 옮길 때마다 다시 시도된다.
        */}
        <ErrorBoundary variant="screen" key={pathname}>
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </div>
      {showTabBar && <TabBar />}
    </div>
  );
}
