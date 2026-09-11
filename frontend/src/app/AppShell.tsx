import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { EVENTS, useAnalytics } from '../shared/analytics';
import { recordVisit } from '../shared/lib/visitLog';
import { LoadingState, iconUrl, type IconName } from '../shared/ui';

import { ErrorBoundary } from './ErrorBoundary';
import { useBridge } from './providers';
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
  const analytics = useAnalytics();
  const bridge = useBridge();
  const showTabBar = isTabRoot(pathname);

  useEffect(() => {
    document.title = SCREEN_TITLES[pathname] ?? '10초 가계부';
    window.scrollTo(0, 0);
  }, [pathname]);

  /*
    들어와서 어디로 가나.

    화면 이름은 경로가 아니라 우리가 붙인 이름으로 남긴다. 경로에는 언젠가 값이 섞이고
    (`?month=2026-08` 같은 것), 그러면 로그에 사용자의 기록이 새기 시작한다.

    **몇 번째 방문인지를 이 한 줄에 다 싣는다.** 안 돌아온 사람은 로그를 남기지 않아서,
    남은 사람 쪽에 "처음 연 지 며칠째인가" 가 없으면 재방문율도 이탈도 셀 수 없다.
    이 값들이 있으면 코호트 질의 없이 단순 집계만으로 D+1·D+7 이 나온다.
  */
  useEffect(() => {
    let alive = true;
    void recordVisit(bridge.storage, Date.now()).then((visit) => {
      if (!alive) return;
      analytics.appOpen(EVENTS.appOpen, {
        entry: SCREEN_TITLES[window.location.pathname] ?? 'unknown',
        toss_app_version: bridge.appVersion,
        is_first_open: visit.isFirstOpen,
        days_since_first_open: visit.daysSinceFirstOpen,
        days_since_last_open: visit.daysSinceLastOpen,
        open_bucket: visit.openBucket,
      });
    });
    return () => {
      alive = false;
    };
  }, [analytics, bridge]);

  useEffect(() => {
    analytics.log(
      EVENTS.screenView,
      { screen: SCREEN_TITLES[pathname] ?? 'unknown' },
      { kind: 'screen' },
    );
  }, [analytics, pathname]);

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
