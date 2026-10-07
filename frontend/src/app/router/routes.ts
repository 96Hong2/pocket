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
  /** 리포트 분류 줄 하나의 기록. 달, 탭, 줄 키를 주소로 받는다. */
  reportCategory: '/report/category',
  manage: '/manage',
  calendar: '/calendar',
  goal: '/goal',
  assets: '/assets',
  assetAnalysis: '/assets/analysis',
  categories: '/manage/categories',
  tags: '/manage/tags',
  recurring: '/manage/recurring',
  settings: '/settings',
  privacy: '/settings/privacy',
  account: '/settings/account',
  notifications: '/settings/notifications',
  /** 같이 쓰는 가계부 목록. 관리 탭에서 들어간다. */
  books: '/books',
  bookNew: '/books/new',
  /** 가계부 하나의 설정. 어느 가계부인지는 `?id=` 로 받는다. 경로에 id 를 넣으면 화면 로그에 id 가 섞인다. */
  bookSettings: '/books/settings',
  bookSettle: '/books/settle',
  /**
   * 초대 링크가 여는 자리. `intoss://pocket-ledger/join?c=<코드>&src=share_invite`.
   * 코드는 `c` 로만 받는다. `src` 는 들어온 길 표시라 소문자로 바뀌어 저장된다.
   */
  join: '/join',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/** 홈이 이 값을 보면 기록 시트를 한 번 연다. `/record` 가 붙여 준다. */
export const RECORD_QUERY = 'record';

/** 가계부 설정·정산이 어느 가계부인지 받는 쿼리 이름. */
export const BOOK_ID_QUERY = 'id';

/** 초대 코드를 받는 쿼리 이름. */
export const JOIN_CODE_QUERY = 'c';

/** 초대 링크로 들어왔다는 표시. `app_open` 의 `src` 에 실린다. */
export const JOIN_SRC = 'share_invite';

/** 가계부 설정을 어디서 열었나. 홈(멤버 얼굴)에서 왔으면 「<이름> 열기」 가 필요 없다. */
export const BOOK_FROM_QUERY = 'from';

export function bookSettingsPath(bookId: string, from?: 'home'): string {
  const base = `${ROUTES.bookSettings}?${BOOK_ID_QUERY}=${encodeURIComponent(bookId)}`;
  return from == null ? base : `${base}&${BOOK_FROM_QUERY}=${from}`;
}

export function bookSettlePath(bookId: string): string {
  return `${ROUTES.bookSettle}?${BOOK_ID_QUERY}=${encodeURIComponent(bookId)}`;
}

/** 앱 안 경로. 토스 딥링크는 `features/share/shareLink.ts` 의 `invitePath` 가 만든다. */
export function joinPath(code: string, src: string = JOIN_SRC): string {
  return `${ROUTES.join}?${JOIN_CODE_QUERY}=${encodeURIComponent(code)}&src=${src}`;
}

/** 리포트의 소비·수입 탭. 주소에 올려 두어야 다른 화면에 다녀와도 보던 탭으로 돌아온다. */
export type ReportTab = 'expense' | 'income';

export const REPORT_MONTH_QUERY = 'month';
export const REPORT_TAB_QUERY = 'tab';
export const REPORT_KEY_QUERY = 'key';

export function parseReportTab(raw: string | null): ReportTab {
  return raw === 'income' ? 'income' : 'expense';
}

/** 보던 달과 탭을 든 리포트 주소. 소비 탭은 기본이라 적지 않는다. */
export function reportPath(month: string | null, tab: ReportTab = 'expense'): string {
  const query = new URLSearchParams();
  if (month != null) query.set(REPORT_MONTH_QUERY, month);
  if (tab === 'income') query.set(REPORT_TAB_QUERY, tab);
  const text = query.toString();
  return text === '' ? ROUTES.report : `${ROUTES.report}?${text}`;
}

export function reportCategoryPath(month: string, tab: ReportTab, key: string): string {
  const query = new URLSearchParams({
    [REPORT_MONTH_QUERY]: month,
    [REPORT_TAB_QUERY]: tab,
    [REPORT_KEY_QUERY]: key,
  });
  return `${ROUTES.reportCategory}?${query.toString()}`;
}

/**
 * 뒤로 갈 자리를 들고 가는 이동 상태. 들어온 자리가 정해진 부모와 다를 때만 쓴다.
 * 리포트에서 연 자산 화면은 관리 탭이 아니라 그 리포트(보던 달과 탭)로 돌아가야 한다.
 */
export interface BackState {
  backTo: string;
}

export function backStateOf(state: unknown): string | null {
  if (state == null || typeof state !== 'object' || !('backTo' in state)) return null;
  const { backTo } = state as { backTo: unknown };
  // 앱 안 경로만 받는다. 바깥 주소로 내보내는 길이 되면 안 된다.
  return typeof backTo === 'string' && backTo.startsWith('/') && !backTo.startsWith('//')
    ? backTo
    : null;
}

/**
 * 상위 화면으로 돌아갈 때 그 화면에 다시 쥐여 줄 이동 상태.
 * 리포트에서 연 자산 화면이 분석에 다녀와도 리포트로 돌아갈 자리(`BackState`)를 잃지 않게 한다.
 */
export interface ParentState {
  parentState: unknown;
}

export function parentStateOf(state: unknown): unknown {
  if (state == null || typeof state !== 'object' || !('parentState' in state)) return undefined;
  return (state as ParentState).parentState;
}

/** 분석 범위 쿼리. `all`·`stock`·`cash`, 모르는 값이면 `all`. */
export const ASSET_SCOPE_QUERY = 'scope';

export type AssetAnalysisScope = 'all' | 'stock' | 'cash';

export function assetAnalysisPath(scope: AssetAnalysisScope = 'all'): string {
  return `${ROUTES.assetAnalysis}?${ASSET_SCOPE_QUERY}=${scope}`;
}

/** 자산 화면을 「바뀐 것만 고쳐요」 창이 열린 채로 연다. 홈 체크인 카드가 쓴다. */
export const ASSET_CHECKIN_QUERY = 'checkin';

export function assetsCheckinPath(): string {
  return `${ROUTES.assets}?${ASSET_CHECKIN_QUERY}=1`;
}

export function parseAssetScope(raw: string | null): AssetAnalysisScope {
  return raw === 'stock' || raw === 'cash' ? raw : 'all';
}

export const DEMO_PATH = '/__demo';

/** 탭바가 보이는 화면. 이 셋에서 뒤로가기를 누르면 미니앱이 종료된다. */
export const TAB_ROOTS: string[] = [ROUTES.home, ROUTES.report, ROUTES.manage];

/**
 * 하위 화면에서 뒤로가기를 눌렀을 때 갈 곳.
 * 딥링크로 하위 화면에 바로 들어와 히스토리가 없을 때 쓴다.
 */
export const PARENT_OF: Record<string, string> = {
  [ROUTES.calendar]: ROUTES.home,
  [ROUTES.reportCategory]: ROUTES.report,
  // 목표·자산의 입구는 관리 탭뿐이다. 홈으로 보내면 들어온 자리와 다른 곳으로 나간다.
  [ROUTES.goal]: ROUTES.manage,
  [ROUTES.assets]: ROUTES.manage,
  [ROUTES.assetAnalysis]: ROUTES.assets,
  [ROUTES.categories]: ROUTES.manage,
  [ROUTES.tags]: ROUTES.manage,
  [ROUTES.recurring]: ROUTES.manage,
  [ROUTES.settings]: ROUTES.manage,
  [ROUTES.privacy]: ROUTES.settings,
  [ROUTES.account]: ROUTES.settings,
  [ROUTES.notifications]: ROUTES.settings,
  [ROUTES.books]: ROUTES.manage,
  [ROUTES.bookNew]: ROUTES.books,
  [ROUTES.bookSettings]: ROUTES.books,
  // 정산은 우리 집 홈의 카드에서 들어간다.
  [ROUTES.bookSettle]: ROUTES.home,
  [ROUTES.join]: ROUTES.home,
  [DEMO_PATH]: ROUTES.home,
};

/** 플랫폼 상단바가 읽는 제목(document.title). 앱이 자체 상단바를 그리지 않는다. */
export const SCREEN_TITLES: Record<string, string> = {
  [ROUTES.home]: '10초 가계부',
  // 곧장 홈으로 넘기는 입구지만, 넘기기 전 한 번 찍히는 화면 로그가 `unknown` 으로 남지 않게.
  [ROUTES.record]: '기록하기',
  [ROUTES.report]: '리포트',
  [ROUTES.reportCategory]: '분류별 기록',
  [ROUTES.manage]: '관리',
  [ROUTES.calendar]: '월간 달력',
  [ROUTES.goal]: '목표',
  [ROUTES.assets]: '자산',
  // 범위가 달라도 화면 이름은 하나다.
  [ROUTES.assetAnalysis]: '내 자산 리포트',
  [ROUTES.categories]: '카테고리 관리',
  [ROUTES.tags]: '태그',
  [ROUTES.recurring]: '반복 지출',
  [ROUTES.settings]: '앱 설정',
  [ROUTES.privacy]: '개인정보처리방침',
  [ROUTES.account]: '내 계정',
  [ROUTES.notifications]: '알림 설정',
  // 가계부 이름을 제목에 넣지 않는다. 제목이 화면 로그와 오류 로그에 실린다.
  [ROUTES.books]: '같이 쓰는 가계부',
  [ROUTES.bookNew]: '가계부 만들기',
  [ROUTES.bookSettings]: '가계부 설정',
  [ROUTES.bookSettle]: '정산',
  [ROUTES.join]: '초대',
  [DEMO_PATH]: '공용 UI',
};

export function isTabRoot(pathname: string): boolean {
  return TAB_ROOTS.includes(pathname);
}

export function parentOf(pathname: string, search = ''): string | null {
  // 분류 화면은 자기 주소에 든 달과 탭으로 돌아간다. 들고 온 상태가 없는 딥링크도 그렇다.
  if (pathname === ROUTES.reportCategory) {
    const query = new URLSearchParams(search);
    return reportPath(query.get(REPORT_MONTH_QUERY), parseReportTab(query.get(REPORT_TAB_QUERY)));
  }
  return PARENT_OF[pathname] ?? null;
}
