import {
  Analytics,
  Device,
  Environment,
  Notification,
  PermissionError,
  SafeArea,
  Screen,
  Storage,
  TossAds,
  User,
  graniteEvent,
  partner,
  tdsEvent,
} from '@apps-in-toss/web-framework';

import {
  BridgeError,
  recordLog,
  type AdsBridge,
  type AnalyticsBridge,
  type AnalyticsKind,
  type AnalyticsParams,
  type AttachBannerOptions,
  type BannerHandle,
  type BridgeCapability,
  type BridgeEnvironment,
  type BridgePlatform,
  type CaptureOptions,
  type Identity,
  type KeyValueStore,
  type MiniAppBridge,
  type NavigationAccessory,
  type NetworkStatus,
  type NotificationAgreementResult,
  type PickPhotosOptions,
  type PickedImage,
  type SafeAreaInsets,
} from './types';

const DEFAULT_MAX_WIDTH = 1600;
const DEFAULT_MAX_COUNT = 5;

/**
 * SDK 가 던지는 것을 브릿지 에러로 옮긴다. 화면은 SDK 에러 이름을 몰라야 한다.
 *
 * ⚠ 메시지 문자열로 판정하지 않는다. SDK 의 실제 메시지는 한국어 안내문이라
 * 'unsupported' 나 'permission' 같은 영어 단어가 들어 있지 않다.
 * - 미지원: `error.name === 'UNSUPPORTED_APP_VERSION'`(OS 부족이면 `UNSUPPORTED_OS_VERSION`)
 * - 권한 거부: `error instanceof PermissionError` (하위 클래스 전부 포함)
 */
function toBridgeError(error: unknown, fallback: string): BridgeError {
  if (error instanceof PermissionError) {
    return new BridgeError('PERMISSION_DENIED', error.message, error);
  }
  if (error instanceof Error && UNSUPPORTED_ERROR_NAMES.has(error.name)) {
    return new BridgeError('UNSUPPORTED', error.message, error);
  }
  return new BridgeError('UNKNOWN', fallback, error);
}

const UNSUPPORTED_ERROR_NAMES = new Set([
  'UNSUPPORTED_APP_VERSION',
  'UNSUPPORTED_OS_VERSION',
]);

class TossStorage implements KeyValueStore {
  get(key: string) {
    return Storage.getItem(key);
  }
  set(key: string, value: string) {
    return Storage.setItem(key, value);
  }
  remove(key: string) {
    return Storage.removeItem(key);
  }
}

/**
 * 토스 공식 Analytics 로 행동 로그를 보낸다.
 *
 * 별도 분석 도구를 붙이지 않는다. 이미 있는 수집 경로 하나를 쓴다.
 * SDK 는 sandbox 에서 콘솔에만 남기고, 낮은 앱 버전에서는 조용히 무시한다. 둘 다 우리가
 * 바라는 동작이라 갈라 다루지 않는다.
 */
class TossAnalyticsBridge implements AnalyticsBridge {
  log(kind: AnalyticsKind, name: string, params: AnalyticsParams = {}): void {
    // 운영이 아닌 판에서는 SDK 가 조용히 삼킨다. 무엇이 찍혔는지 볼 수 있게 사본을 남긴다.
    recordLog(Environment.environment, kind, name, params);
    // 로그는 부수적인 일이다. 여기서 던지면 기록·저장이 멈춘다.
    void Promise.resolve()
      .then(() => Analytics.log({ log_type: kind, log_name: name, params }))
      .catch(() => {});
  }
}

class TossAdsBridge implements AdsBridge {
  private initialized: Promise<void> | null = null;

  initialize(): Promise<void> {
    // initialize 는 SDK 상 멱등이지만, 우리 쪽에서도 한 번만 대기하도록 promise 를 캐시한다.
    // 실패한 promise 는 캐시하지 않는다. 일시적인 스크립트 로드 실패 한 번으로
    // 세션 내내 배너 자리가 접힌 채로 남으면 안 된다.
    this.initialized ??= new Promise<void>((resolve, reject) => {
      if (!TossAds.initialize.isSupported()) {
        reject(new BridgeError('UNSUPPORTED', '이 토스 앱 버전에서는 배너 광고를 쓸 수 없어요.'));
        return;
      }
      TossAds.initialize({
        callbacks: {
          onInitialized: () => resolve(),
          onInitializationFailed: (error) =>
            reject(new BridgeError('UNKNOWN', '배너 광고를 준비하지 못했어요.', error)),
        },
      });
    }).catch((error: unknown) => {
      this.initialized = null;
      throw error;
    });
    return this.initialized;
  }

  attachBanner(
    adGroupId: string,
    target: HTMLElement,
    options: AttachBannerOptions = {},
  ): BannerHandle {
    if (!TossAds.attachBanner.isSupported()) {
      options.onFailed?.('이 토스 앱 버전에서는 배너 광고를 쓸 수 없어요.');
      return { destroy: () => {} };
    }
    return TossAds.attachBanner(adGroupId, target, {
      variant: options.variant ?? 'card',
      tone: options.tone,
      theme: options.theme ?? 'auto',
      callbacks: {
        onAdRendered: (payload) => options.onRendered?.(payload.slotId),
        onNoFill: () => options.onNoFill?.(),
        onAdFailedToRender: (payload) => options.onFailed?.(payload.error.message),
      },
    });
  }
}

export class TossMiniAppBridge implements MiniAppBridge {
  readonly environment: BridgeEnvironment;
  readonly platform: BridgePlatform;
  readonly appVersion: string;
  readonly storage = new TossStorage();
  readonly ads = new TossAdsBridge();
  readonly analytics = new TossAnalyticsBridge();

  constructor() {
    this.environment = Environment.environment;
    this.platform = Device.os;
    this.appVersion = Environment.tossAppVersion;
  }

  supports(capability: BridgeCapability): boolean {
    switch (capability) {
      case 'identity':
        return User.getAnonymousKey.isSupported();
      case 'albumPick':
        // getPhotos 는 버전 게이트가 없다. 앨범 자체는 항상 열 수 있다.
        return true;
      case 'camera':
        return true;
      case 'storage':
        return true;
      case 'networkStatus':
        return true;
      case 'safeArea':
        return true;
      case 'navigationAccessory':
        return true;
      case 'ads':
        return TossAds.attachBanner.isSupported();
      case 'notification':
        return Notification.requestAgreement.isSupported();
      case 'analytics':
        // 낮은 버전에서는 SDK 가 조용히 무시한다. 화면이 로그 때문에 갈릴 일은 없다.
        return true;
    }
  }

  minAppVersion(capability: BridgeCapability): string | null {
    // 버전으로 갈리는 것만 적는다. 나머지는 앱 버전과 무관하거나 SDK 가 하한을 알려 주지 않는다.
    if (capability !== 'notification') return null;
    const gate = Notification.requestAgreement.MIN_TOSS_APP_VERSION;
    if (this.platform === 'ios') return gate.ios;
    if (this.platform === 'android') return gate.android;
    return null;
  }

  async getIdentity(): Promise<Identity> {
    try {
      const result = await User.getAnonymousKey();
      return { key: result.hash, source: 'toss-anonymous' };
    } catch (error) {
      throw toBridgeError(error, '사용자 정보를 확인하지 못했어요.');
    }
  }

  async pickPhotos(options: PickPhotosOptions = {}): Promise<PickedImage[]> {
    try {
      const photos = await Device.getPhotos({
        base64: true,
        maxCount: options.maxCount ?? DEFAULT_MAX_COUNT,
        maxWidth: options.maxWidth ?? DEFAULT_MAX_WIDTH,
      });
      return photos.map(({ id, dataUri }) => ({ id, dataUri }));
    } catch (error) {
      throw toBridgeError(error, '앨범을 열지 못했어요.');
    }
  }

  async captureReceipt(options: CaptureOptions = {}): Promise<PickedImage | null> {
    try {
      const image = await Device.openCamera({
        base64: true,
        maxWidth: options.maxWidth ?? DEFAULT_MAX_WIDTH,
      });
      // 취소하면 dataUri 가 비어 온다.
      return image?.dataUri ? { id: image.id, dataUri: image.dataUri } : null;
    } catch (error) {
      throw toBridgeError(error, '카메라를 열지 못했어요.');
    }
  }

  /**
   * 알림 동의 화면을 띄우고 결과를 기다린다.
   *
   * SDK 가 콜백 방식이라 여기서 한 번만 Promise 로 바꾼다. 화면은 await 만 한다.
   *
   * **정리 함수는 함수일 때만 부른다.** 타입 선언은 함수를 돌려준다고 하는데 실기기와
   * devtools 목이 객체를 돌려준 기록이 있다. 그대로 부르면 동의를 받고도 TypeError 로
   * 끝나, 켜지지 않은 것처럼 보인다.
   */
  requestNotificationAgreement(templateCode: string): Promise<NotificationAgreementResult> {
    if (!Notification.requestAgreement.isSupported()) {
      return Promise.reject(
        new BridgeError('UNSUPPORTED', '이 토스 앱 버전에서는 알림을 켤 수 없어요.'),
      );
    }
    // 템플릿 코드가 없으면 실기기에서 동의 화면 자체가 뜨지 않는다. 개발 중에는 화면을
    // 끝까지 눌러 볼 수 있게 통과시키고, 그 밖에서는 못 쓰는 기능으로 다룬다.
    if (templateCode.trim() === '') {
      if (!import.meta.env.DEV) {
        return Promise.reject(
          new BridgeError('UNSUPPORTED', '알림 템플릿이 설정되지 않아 알림을 켤 수 없어요.'),
        );
      }
      return Promise.resolve('alreadyAgreed');
    }

    return new Promise<NotificationAgreementResult>((resolve, reject) => {
      // 콜백이 먼저 도착해도 안전하게 미리 선언해 둔다.
      let cleanup: unknown;
      const release = () => {
        if (typeof cleanup === 'function') (cleanup as () => void)();
      };

      cleanup = Notification.requestAgreement({
        options: { templateCode },
        onEvent: ({ type }) => {
          resolve(type);
          release();
        },
        onError: (error) => {
          reject(toBridgeError(error, '알림 동의를 받지 못했어요.'));
          release();
        },
      });
    });
  }

  getSafeAreaInsets(): SafeAreaInsets {
    return SafeArea.get();
  }

  subscribeSafeArea(listener: (insets: SafeAreaInsets) => void): () => void {
    return SafeArea.subscribe({ onEvent: listener });
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return Environment.getNetworkStatus();
  }

  async setNavigationAccessory(accessory: NavigationAccessory | null): Promise<void> {
    if (accessory == null) {
      await partner.removeAccessoryButton();
      return;
    }
    await partner.addAccessoryButton({
      id: accessory.id,
      title: accessory.title,
      icon: { name: accessory.iconName },
    });
  }

  onNavigationAccessoryPress(listener: (id: string) => void): () => void {
    return tdsEvent.addEventListener('navigationAccessoryEvent', {
      onEvent: ({ id }) => listener(id),
    });
  }

  subscribeBackPress(listener: () => void): () => void {
    return graniteEvent.addEventListener('backEvent', { onEvent: listener });
  }

  closeApp(): Promise<void> {
    return Screen.close();
  }
}
