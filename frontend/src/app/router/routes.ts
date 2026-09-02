/** 화면 경로 한 곳. 문자열을 화면마다 다시 적지 않는다. */
export const ROUTES = {
  home: '/',
  report: '/report',
  manage: '/manage',
  calendar: '/calendar',
  goal: '/goal',
  assets: '/assets',
  categories: '/manage/categories',
  settings: '/settings',
  notifications: '/settings/notifications',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/** 개발 중에만 열리는 공용 UI 갤러리. */
export const DEMO_PATH = '/__demo';

/** 탭바가 보이는 화면. 이 셋에서 뒤로가기를 누르면 미니앱이 종료된다. */
export const TAB_ROOTS: string[] = [ROUTES.home, ROUTES.report, ROUTES.manage];

/**
 * 하위 화면에서 뒤로가기를 눌렀을 때 갈 곳.
 * 딥링크로 하위 화면에 바로 들어와 히스토리가 없을 때 쓴다.
 */
export const PARENT_OF: Record<string, string> = {
  [ROUTES.calendar]: ROUTES.home,
  [ROUTES.goal]: ROUTES.home,
  [ROUTES.assets]: ROUTES.home,
  [ROUTES.categories]: ROUTES.manage,
  [ROUTES.settings]: ROUTES.manage,
  [ROUTES.notifications]: ROUTES.settings,
  [DEMO_PATH]: ROUTES.home,
};

/** 플랫폼 상단바가 읽는 제목(document.title). 앱이 자체 상단바를 그리지 않는다. */
export const SCREEN_TITLES: Record<string, string> = {
  [ROUTES.home]: '10초 가계부',
  [ROUTES.report]: '리포트',
  [ROUTES.manage]: '관리',
  [ROUTES.calendar]: '월간 달력',
  [ROUTES.goal]: '목표',
  [ROUTES.assets]: '자산',
  [ROUTES.categories]: '카테고리 관리',
  [ROUTES.settings]: '앱 설정',
  [ROUTES.notifications]: '알림 설정',
  [DEMO_PATH]: '공용 UI',
};

export function isTabRoot(pathname: string): boolean {
  return TAB_ROOTS.includes(pathname);
}

export function parentOf(pathname: string): string | null {
  return PARENT_OF[pathname] ?? null;
}
