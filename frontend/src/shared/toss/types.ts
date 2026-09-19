/**
 * 미니앱 브릿지 계약.
 *
 * 화면과 feature 는 이 타입만 알면 된다. Apps in Toss SDK 의 이름·시그니처·에러 클래스는
 * 이 파일 바깥으로 새어나가지 않는다. 브라우저에서 개발할 때는 같은 계약의 Mock 이 붙는다.
 */

export type BridgeEnvironment = 'toss' | 'sandbox' | 'browser';

export type BridgePlatform = 'ios' | 'android' | 'web';

/** 브릿지가 노출하는 기능 단위. supports() 로 지원 여부를 먼저 묻는다. */
export type BridgeCapability =
  | 'identity'
  | 'albumPick'
  | 'camera'
  | 'storage'
  | 'networkStatus'
  | 'safeArea'
  | 'navigationAccessory'
  | 'ads'
  /** 전면·리워드 광고. SDK 게이트가 같아서 한 칸으로 본다. 배너와는 따로 갈린다. */
  | 'fullScreenAd'
  | 'notification'
  | 'analytics'
  /** 시스템 공유 시트. 링크를 만들어 친구에게 보낸다. */
  | 'share';

/**
 * 토스 알림 동의 요청의 결과.
 *
 * `agreementRejected` 도 오류가 아니라 결과의 한 종류다. 사용자가 안 받겠다고 고른 것이라
 * 다시 묻지 않는다. 값 이름은 SDK 가 주는 것을 그대로 쓴다.
 */
export type NotificationAgreementResult = 'newAgreement' | 'alreadyAgreed' | 'agreementRejected';

/** 앨범·카메라가 돌려주는 이미지. dataUri 는 base64 data URL 이다. */
export interface PickedImage {
  id: string;
  dataUri: string;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type NetworkStatus = 'OFFLINE' | 'WIFI' | '2G' | '3G' | '4G' | '5G' | 'WWAN' | 'UNKNOWN';

/** 익명 사용자 식별키. 로그인 화면 없이 사용자를 구분하는 유일한 수단이다. */
export interface Identity {
  /** 토스가 미니앱별로 발급하는 해시. 서버의 user 조회 키로 쓴다. */
  key: string;
  source: 'toss-anonymous' | 'mock';
}

/**
 * 브릿지가 실패를 알리는 방식. SDK 의 에러 클래스를 그대로 던지지 않고 이 코드로 바꾼다.
 * 화면은 코드만 보고 어떤 빈 상태를 그릴지 정한다.
 */
export type BridgeErrorCode =
  /** 이 토스 앱 버전에서 못 쓰는 기능 */
  | 'UNSUPPORTED'
  /** 사용자가 권한을 거부함 */
  | 'PERMISSION_DENIED'
  /** 사용자가 선택·촬영을 취소함 */
  | 'CANCELLED'
  /** 그 외 */
  | 'UNKNOWN';

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly detail: unknown;

  constructor(code: BridgeErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.detail = detail;
  }
}

export interface PickPhotosOptions {
  /** 한 번에 고를 수 있는 최대 장수. */
  maxCount?: number;
  /** 긴 변 기준 최대 픽셀. 업로드 용량을 줄이려고 항상 지정한다. */
  maxWidth?: number;
}

export interface CaptureOptions {
  maxWidth?: number;
}

/** 키-값 저장소. 오프라인 임시 저장과 마지막 사용 입력 방식 기억에 쓴다. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface BannerHandle {
  destroy(): void;
}

export type BannerVariant = 'card' | 'expanded';

export interface AttachBannerOptions {
  variant?: BannerVariant;
  tone?: 'blackAndWhite' | 'grey';
  theme?: 'auto' | 'light' | 'dark';
  onRendered?(slotId: string): void;
  /** 노출된 광고가 없음. 자리를 비워두지 말고 슬롯 자체를 접는다. */
  onNoFill?(): void;
  onFailed?(message: string): void;
}

/**
 * 전면 광고를 끝까지 본 결과.
 *
 * `watched` 는 광고가 뜨고 닫힌 것이다. 보상형이면 보상 이벤트 뒤에, 전면형이면 닫힘 뒤에
 * 온다. 둘 다 「봤다」로 친다. `failed` 는 못 불러왔거나 못 띄운 것이라 사용자 탓이 아니다.
 */
/**
 * 전면·리워드 광고를 지나온 결과.
 *
 * - `earned`   보상 이벤트까지 왔다. 리워드형 그룹에서만 온다
 * - `watched`  떴다가 닫혔다. 전면형이 정상으로 끝난 모양이다
 * - `failed`   못 띄웠다
 */
export type FullScreenAdResult = 'earned' | 'watched' | 'failed';

export interface AdsBridge {
  /** 배너를 붙이기 전에 한 번 호출한다. 멱등이다. */
  initialize(): Promise<void>;
  attachBanner(adGroupId: string, target: HTMLElement, options?: AttachBannerOptions): BannerHandle;
  /**
   * 전면 광고를 불러와서 띄우고, 닫힐 때까지 기다린다.
   *
   * 던지지 않는다. 못 띄운 것은 `failed` 로 돌려주고 부르는 쪽이 갈래를 정한다.
   * 광고가 안 떴다고 기능을 막으면 광고 서버 사정으로 사람이 돌아간다.
   */
  showFullScreen(adGroupId: string): Promise<FullScreenAdResult>;
  /**
   * 리워드 광고를 불러와서 띄우고, 닫힐 때까지 기다린다.
   *
   * SDK 호출은 전면과 같다. 전면형인지 리워드형인지는 콘솔에 등록한 그룹이 정한다.
   * 그래도 자리를 나눠 둔다. **부르는 쪽이 기대하는 답이 다르기 때문이다**: 리워드는
   * 끝까지 본 사람만 `earned` 라, 「보상을 받았나」 를 전면의 「떴다 닫혔나」 와 같은
   * 값으로 읽으면 안 된다.
   */
  showRewarded(adGroupId: string): Promise<FullScreenAdResult>;
}

/**
 * 행동 로그 한 줄에 실을 값.
 *
 * 문자열·숫자·불리언만 받는다. 중첩 객체를 허용하면 언젠가 응답 본문이 통째로 실린다.
 * `undefined` 는 SDK 가 알아서 빼므로 부르는 쪽이 조건문으로 나누지 않아도 된다.
 */
export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

/**
 * 무슨 종류의 로그인가. 토스 SDK 가 정한 값이라 우리가 늘리지 않는다.
 *
 * `screen` 화면 진입 · `click` 누름 · `impression` 노출 · `event` 그 밖의 사실.
 */
export type AnalyticsKind = 'screen' | 'click' | 'impression' | 'event';

/**
 * 행동 로그를 보내는 자리.
 *
 * **실패해도 던지지 않는다.** 로그가 안 가는 것보다 기록이 막히는 쪽이 훨씬 나쁘다.
 * 미지원 앱 버전에서는 SDK 가 조용히 무시하고, 브라우저에서는 목이 콘솔에만 남긴다.
 */
export interface AnalyticsBridge {
  log(kind: AnalyticsKind, name: string, params?: AnalyticsParams): void;
}

/**
 * 친구에게 보낼 것 한 벌.
 *
 * `path` 는 링크를 누른 사람이 열게 될 자리다. `intoss://` 로 시작하는 딥링크여야 하고,
 * 그 규칙은 토스가 정한 것이라 여기서 검사하지 않는다(어기면 SDK 가 던진다).
 *
 * `ogImageUrl` 은 미리보기에 뜨는 그림이다. 안 주면 콘솔에 등록한 앱 기본 그림이 쓰인다.
 * 못 만들었으면 비워서 보낸다. 그림 하나 때문에 공유 자체를 막지 않는다.
 */
export interface ShareTarget {
  path: string;
  ogImageUrl?: string;
  /** 링크 앞에 붙는 한 줄. 받는 사람이 링크보다 먼저 읽는 글이다. */
  message: string;
}

/**
 * 공유 시트를 여는 자리.
 *
 * 링크 만들기와 시트 열기를 한 번으로 묶는다. 화면이 둘을 따로 부르면 링크만 만들고
 * 시트를 못 연 상태가 생기는데, 그때 사용자에게는 아무 일도 안 일어난 것으로 보인다.
 *
 * **실패하면 던진다.** 부르는 쪽이 왜 안 됐는지 화면에 적어야 한다.
 */
export interface ShareBridge {
  send(target: ShareTarget): Promise<void>;
}

/** 내보낸 공유 한 건. 운영 판이 아닐 때만 창에 쌓인다. */
export interface RecordedShare {
  path: string;
  ogImageUrl: string | null;
  message: string;
}

/** 남긴 행동 로그 한 줄. 운영 판이 아닐 때만 창에 쌓인다. */
export interface RecordedLog {
  kind: AnalyticsKind;
  name: string;
  params: AnalyticsParams;
}

declare global {
  interface Window {
    /**
     * 브라우저·샌드박스에서만 있는 로그 사본.
     *
     * 토스 SDK 는 운영 판에서만 실제로 로그를 보내고, 그 밖에서는 조용히 삼킨다.
     * 그래서 개발 중에도 e2e 에서도 "무엇이 찍혔나" 를 볼 방법이 없었다.
     * 여기 쌓아 두면 눈으로도 보고 테스트로도 본다. 운영 판에서는 채우지 않는다.
     */
    __pocketLogs?: RecordedLog[];
    /**
     * 브라우저·샌드박스에서만 있는 공유 사본.
     *
     * 시스템 공유 시트는 웹 페이지 바깥에서 뜬다. 무엇을 들고 나갔는지는 화면에 흔적이
     * 남지 않아, 이 배열이 없으면 개발 중에도 e2e 에서도 확인할 방법이 없다.
     *
     * **행동 로그와 담는 것이 다르다.** 로그에는 갈래 이름까지만 싣는다(`events.ts`).
     * 공유 문구에는 목표 이름과 금액이 들어가서 로그에 실을 수 없다. 여기 사본에만 둔다.
     * 운영 판에서는 채우지 않는다.
     */
    __pocketShares?: RecordedShare[];
  }
}

/** 운영 판이 아닐 때 로그를 창에 남긴다. 실패해도 아무 일도 일어나지 않는다. */
export function recordLog(
  environment: BridgeEnvironment,
  kind: AnalyticsKind,
  name: string,
  params: AnalyticsParams,
): void {
  if (environment === 'toss' || typeof window === 'undefined') return;
  (window.__pocketLogs ??= []).push({ kind, name, params });
}

/** 운영 판이 아닐 때 내보낸 공유를 창에 남긴다. 실패해도 아무 일도 일어나지 않는다. */
export function recordShare(
  environment: BridgeEnvironment,
  target: ShareTarget,
): void {
  if (environment === 'toss' || typeof window === 'undefined') return;
  (window.__pocketShares ??= []).push({
    path: target.path,
    ogImageUrl: target.ogImageUrl ?? null,
    message: target.message,
  });
}

export interface NavigationAccessory {
  id: string;
  title: string;
  /** 토스가 제공하는 아이콘 이름. 임의 이미지가 아니다. */
  iconName: string;
}

export interface MiniAppBridge {
  readonly environment: BridgeEnvironment;
  readonly platform: BridgePlatform;
  /** 토스 앱 버전. 브라우저에서는 빈 문자열. */
  readonly appVersion: string;
  /**
   * 기기 고유 식별자. **진단 화면에만 보여 주고 로그·서버로는 보내지 않는다.**
   * 이 값이 로그에 실리면 익명 집계가 기기 단위 추적이 된다. 브라우저에서는 빈 문자열.
   */
  readonly deviceId: string;
  /** 지금 돌고 있는 번들. 개발에서는 'local', 브라우저에서는 빈 문자열. */
  readonly deploymentId: string;

  supports(capability: BridgeCapability): boolean;

  /**
   * 그 기능을 쓰려면 토스 앱이 적어도 몇이어야 하는지. 버전으로 갈리지 않으면 null.
   *
   * 못 쓰는 화면이 "업데이트하세요" 만 말하면, 이미 최신인 사람은 무엇을 해야 할지 모른다.
   * 숫자를 알면 지금 버전과 견줘 보고 정말 업데이트 문제인지 스스로 가를 수 있다.
   */
  minAppVersion(capability: BridgeCapability): string | null;

  /** 실패하면 BridgeError 를 던진다. 호출부는 반드시 감싼다. */
  getIdentity(): Promise<Identity>;

  /** 취소하면 빈 배열을 돌려준다. 권한 거부는 BridgeError('PERMISSION_DENIED'). */
  pickPhotos(options?: PickPhotosOptions): Promise<PickedImage[]>;

  /** 취소하면 null 을 돌려준다. */
  captureReceipt(options?: CaptureOptions): Promise<PickedImage | null>;

  /**
   * 토스 알림 동의를 묻는다. **사용자가 알림을 켜는 그 순간에만 부른다.**
   *
   * `templateCode` 는 토스 콘솔 스마트발송 템플릿 코드다. 거절도 결과의 한 종류라 던지지
   * 않는다. 이 버전에서 못 쓰거나 템플릿 코드가 없으면 BridgeError('UNSUPPORTED').
   */
  requestNotificationAgreement(templateCode: string): Promise<NotificationAgreementResult>;

  getSafeAreaInsets(): SafeAreaInsets;
  subscribeSafeArea(listener: (insets: SafeAreaInsets) => void): () => void;

  getNetworkStatus(): Promise<NetworkStatus>;

  /** 상단 네비게이션 바 우측 버튼. 앱이 자체 상단바를 그리지 않기 위한 통로다. */
  setNavigationAccessory(accessory: NavigationAccessory | null): Promise<void>;
  onNavigationAccessoryPress(listener: (id: string) => void): () => void;

  /**
   * 시스템 뒤로가기.
   *
   * ⚠ 구독하는 순간 플랫폼 기본 뒤로가기가 막힌다. 구독했으면 화면 이동과 앱 종료를 우리가 전부 처리해야 한다.
   * 앱 전체에서 한 곳만 구독한다.
   */
  subscribeBackPress(listener: () => void): () => void;

  /** 미니앱을 닫는다. 첫 화면에서 뒤로가기를 눌렀을 때 호출한다. */
  closeApp(): Promise<void>;

  readonly storage: KeyValueStore;
  readonly ads: AdsBridge;
  readonly analytics: AnalyticsBridge;
  readonly share: ShareBridge;
}
