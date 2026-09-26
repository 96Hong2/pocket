/** 화면 경로 한 곳. 문자열을 화면마다 다시 적지 않는다. */
export const ROUTES = {
  home: '/',
  /**
   * 기록 시트를 곧장 여는 입구. 화면이 따로 있는 것은 아니고 홈으로 넘기면서 시트를 연다.
   *
   * 미니앱 상세의 주요 기능은 `intoss://pocket-ledger/<경로>` 로만 건다. 기록 시트는 홈 위에
   * 뜨는 창이라 자기 경로가 없어서, 가장 많이 쓰는 「지출 기록하기」 를 걸 수가 없었다.
   */
  record: '/record',
  report: '/report',
  manage: '/manage',
  calendar: '/calendar',
  goal: '/goal',
  assets: '/assets',
  categories: '/manage/categories',
  tags: '/manage/tags',
  recurring: '/manage/recurring',
  settings: '/settings',
  privacy: '/settings/privacy',
  account: '/settings/account',
  notifications: '/settings/notifications',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/** 홈이 이 값을 보면 기록 시트를 한 번 연다. `/record` 가 붙여 준다. */
export const RECORD_QUERY = 'record';

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
  // 목표·자산의 입구는 관리 탭뿐이다. 홈으로 보내면 들어온 자리와 다른 곳으로 나간다.
  [ROUTES.goal]: ROUTES.manage,
  [ROUTES.assets]: ROUTES.manage,
  [ROUTES.categories]: ROUTES.manage,
  [ROUTES.tags]: ROUTES.manage,
  [ROUTES.recurring]: ROUTES.manage,
  [ROUTES.settings]: ROUTES.manage,
  [ROUTES.privacy]: ROUTES.settings,
  [ROUTES.account]: ROUTES.settings,
  [ROUTES.notifications]: ROUTES.settings,
  [DEMO_PATH]: ROUTES.home,
};

/** 플랫폼 상단바가 읽는 제목(document.title). 앱이 자체 상단바를 그리지 않는다. */
export const SCREEN_TITLES: Record<string, string> = {
  [ROUTES.home]: '10초 가계부',
  // 곧장 홈으로 넘기는 입구지만, 넘기기 전 한 번 찍히는 화면 로그가 `unknown` 으로 남지 않게.
  [ROUTES.record]: '기록하기',
  [ROUTES.report]: '리포트',
  [ROUTES.manage]: '관리',
  [ROUTES.calendar]: '월간 달력',
  [ROUTES.goal]: '목표',
  [ROUTES.assets]: '자산',
  [ROUTES.categories]: '카테고리 관리',
  [ROUTES.tags]: '태그',
  [ROUTES.recurring]: '반복 지출',
  [ROUTES.settings]: '앱 설정',
  [ROUTES.privacy]: '개인정보처리방침',
  [ROUTES.account]: '내 계정',
  [ROUTES.notifications]: '알림 설정',
  [DEMO_PATH]: '공용 UI',
};

export function isTabRoot(pathname: string): boolean {
  return TAB_ROOTS.includes(pathname);
}

export function parentOf(pathname: string): string | null {
  return PARENT_OF[pathname] ?? null;
}
