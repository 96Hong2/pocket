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
  | 'ads';

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

export type NetworkStatus =
  | 'OFFLINE'
  | 'WIFI'
  | '2G'
  | '3G'
  | '4G'
  | '5G'
  | 'WWAN'
  | 'UNKNOWN';

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

export interface AdsBridge {
  /** 배너를 붙이기 전에 한 번 호출한다. 멱등이다. */
  initialize(): Promise<void>;
  attachBanner(
    adGroupId: string,
    target: HTMLElement,
    options?: AttachBannerOptions,
  ): BannerHandle;
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

  supports(capability: BridgeCapability): boolean;

  /** 실패하면 BridgeError 를 던진다. 호출부는 반드시 감싼다. */
  getIdentity(): Promise<Identity>;

  /** 취소하면 빈 배열을 돌려준다. 권한 거부는 BridgeError('PERMISSION_DENIED'). */
  pickPhotos(options?: PickPhotosOptions): Promise<PickedImage[]>;

  /** 취소하면 null 을 돌려준다. */
  captureReceipt(options?: CaptureOptions): Promise<PickedImage | null>;

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
}
