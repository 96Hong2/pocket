import {
  Analytics,
  Device,
  Environment,
  // SDK 가 내보내는 이름이 `File` 이라 그대로 쓰면 브라우저의 File 을 가린다.
  // 이 파일에서 `new File(...)` 을 쓸 일이 생기면 조용히 엉뚱한 것이 잡힌다. 이름만 비킨다.
  File as TossFile,
  Notification,
  Review,
  PermissionError,
  SafeArea,
  Screen,
  Share,
  Storage,
  TossAds,
  User,
  graniteEvent,
  loadFullScreenAd,
  partner,
  showFullScreenAd,
  tdsEvent,
} from '@apps-in-toss/web-framework';

import {
  DISMISS_FALLBACK_MS,
  FULL_SCREEN_LOAD_TIMEOUT_MS,
  FULL_SCREEN_SHOW_TIMEOUT_MS,
  adEventEffect,
  marksAdOnScreen,
  outcomeOf,
} from './fullScreenAdFlow';

import {
  BridgeError,
  recordLog,
  recordReview,
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
  type FileBridge,
  type FullScreenAdHooks,
  type FullScreenAdResult,
  type Identity,
  type KeyValueStore,
  type MiniAppBridge,
  type NavigationAccessory,
  type NetworkStatus,
  type NotificationAgreementResult,
  type PickPhotosOptions,
  type PickedImage,
  type SafeAreaInsets,
  type SaveFileTarget,
  type ShareBridge,
  type ShareTarget,
  recordFileSave,
  recordShare,
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

const UNSUPPORTED_ERROR_NAMES = new Set(['UNSUPPORTED_APP_VERSION', 'UNSUPPORTED_OS_VERSION']);

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

  showFullScreen(adGroupId: string, hooks?: FullScreenAdHooks): Promise<FullScreenAdResult> {
    return runFullScreenAd(adGroupId, hooks);
  }

  /*
    SDK 호출이 전면과 한 글자도 다르지 않다. 전면형인지 리워드형인지는 콘솔에 등록한
    그룹이 정하기 때문이다. 부르는 쪽이 어느 쪽을 기대하는지만 이 이름으로 갈린다.
  */
  showRewarded(adGroupId: string, hooks?: FullScreenAdHooks): Promise<FullScreenAdResult> {
    return runFullScreenAd(adGroupId, hooks);
  }
}

/**
 * 전면 광고 한 편을 불러와 띄우고 닫힐 때까지 기다린다.
 *
 * 보상 이벤트가 오면 `earned`, 떴다가 그냥 닫히면 `watched` 다. **둘을 뭉치지 않는다.**
 * 리워드형에서 보상 없이 닫힌 것은 중간에 나갔다는 뜻이라, 끝까지 본 사람과 같이 세면
 * 리워드 자리가 실제로 얼마나 끝까지 읽히는지 알 수 없다.
 *
 * 무엇이 「떴다」 이고 무엇이 끝인지는 `fullScreenAdFlow` 가 정한다. 여기는 배선이다.
 */
function runFullScreenAd(
  adGroupId: string,
  hooks?: FullScreenAdHooks,
): Promise<FullScreenAdResult> {
  if (!loadFullScreenAd.isSupported() || !showFullScreenAd.isSupported()) {
    return Promise.resolve('failed');
  }
  return new Promise<FullScreenAdResult>((resolve) => {
    let settled = false;
    /**
     * 이미 한 편을 띄우라고 보냈나. **「떴다」 와 다른 값이다.**
     *
     * 보냈는데 한 번도 안 뜬 판이 있다. 그것을 `watched` 로 세면 광고가 한 장도 안 온
     * 기기와 끝까지 본 사람이 같은 칸에 들어간다. 그래서 둘을 따로 둔다.
     */
    let launched = false;
    /** 뜬 것으로 읽는 이벤트가 실제로 왔나. 결과를 가르는 것은 이쪽이다. */
    let shown = false;
    let earned = false;

    /*
      구독을 끊는 함수 둘. **받아서 쥐고 있다가 끝날 때 부른다.**

      예전에는 두 반환값을 그냥 버렸다. 끝난 뒤에도 구독이 살아 있어서 다음 광고의 신호가
      이미 끝난 판의 콜백으로 들어온다. 사진 자리가 상한 밖으로 나가며(ADR-0035) 한
      세션에 광고가 여러 편 도는 일이 흔해져, 이 누수가 실제로 겹치기 시작했다.

      노출 쪽 구독을 끊는 것에는 기대가 하나 더 있다. 그 실체가 SDK 의
      `__unsubscribeAppEvent` 라, 노출 중에 보내면 네이티브가 광고를 정리할지도 모른다.
      **정리한다면 그것이 멈춘 광고를 걷는 유일한 길이다**(우리에게 닫는 함수는 없다).
      확인은 실기기 몫이고, 여기서는 일단 제때 끊어 둔다.
    */
    let cancelLoad: (() => void) | undefined;
    let cancelShow: (() => void) | undefined;
    let loadCancelled = false;

    /** 광고가 뜬 뒤 화면이 다시 보이는지 듣는 자리. 닫힘 신호를 안 주는 버전을 위한 것이다. */
    let onVisible: (() => void) | undefined;
    /** 화면이 돌아온 뒤 닫힘으로 접기까지 기다리는 타이머. 다시 숨으면 걷는다. */
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;

    let timer = setTimeout(() => finish('failed'), FULL_SCREEN_LOAD_TIMEOUT_MS);

    function stopLoading(): void {
      if (loadCancelled) return;
      loadCancelled = true;
      cancelLoad?.();
    }

    function finish(result: FullScreenAdResult): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(dismissTimer);
      stopLoading();
      cancelShow?.();
      if (onVisible != null) document.removeEventListener('visibilitychange', onVisible);
      resolve(result);
    }

    /**
     * 광고가 사람 눈앞에 섰다. 한 편에 한 번만 돈다.
     *
     * 여기서 닫힘 폴백을 건다. 안드로이드 토스앱 5.255.0 은 `dismissed` 를 주지 않아
     * (공식 FAQ), 폴백이 없으면 광고가 닫혀도 화면이 시간 제한까지 기다린다.
     */
    function onScreen(): void {
      if (shown) return;
      shown = true;
      hooks?.onShown?.();
      if (onVisible != null) return;
      onVisible = () => {
        /*
          ⚠ **다시 숨으면 걷는다.** 광고를 눌러 광고주 페이지로 나갔다 오는 길에 화면이
          잠깐 보이는 순간이 있다. 그때 건 타이머를 안 걷으면, 돌아와 끝까지 봐도 2초
          뒤에 이미 닫힘으로 접혀 보상을 못 받는다. 광고를 눌러 준 사람이 가장 손해다.
        */
        if (document.visibilityState !== 'visible') {
          clearTimeout(dismissTimer);
          dismissTimer = undefined;
          return;
        }
        if (dismissTimer != null) return;
        dismissTimer = setTimeout(() => {
          // 접기 직전에 한 번 더 본다. 그 사이에 다시 숨었으면 아직 광고 중이다.
          if (document.visibilityState !== 'visible') return;
          finish(outcomeOf({ shown, earned }));
        }, DISMISS_FALLBACK_MS);
      };
      document.addEventListener('visibilitychange', onVisible);
    }

    const show = () => {
      /*
        한 편만 띄운다. 이 함수는 로드 구독의 `loaded` 에서 불리는데 그 구독은 한 번
        불렀다고 끊기지 않아서, `loaded` 가 한 번 더 오면 광고가 또 떠오른다.

        `settled` 도 함께 본다. 8초를 넘겨 이미 「못 띄웠다」 고 답한 뒤에 띄우면 부르던
        쪽은 벌써 다음 화면을 열었으므로 엉뚱한 화면 위로 광고가 덮인다.
      */
      if (settled || launched) return;
      launched = true;
      // 불러오기는 끝났다. 이제부터는 사람이 광고를 보는 시간이라 시계를 갈아 끼운다.
      clearTimeout(timer);
      timer = setTimeout(() => {
        hooks?.onStalled?.();
        finish(outcomeOf({ shown, earned }));
      }, FULL_SCREEN_SHOW_TIMEOUT_MS);

      cancelShow = showFullScreenAd({
        options: { adGroupId },
        onEvent: (event) => {
          /*
            끝난 뒤에 오는 신호는 버린다. 없으면 `finish` 가 떼고 간 자리에 리스너를
            새로 달게 되고, 그것을 떼어 줄 사람이 아무도 없다.
          */
          if (settled) return;
          if (marksAdOnScreen(event.type)) onScreen();
          const effect = adEventEffect(event.type);
          /*
            보상 이벤트 뒤에도 닫힘이 따라온다. 여기서 바로 끝내지 않고 표시만 해 두는
            이유는, 광고가 아직 화면을 덮고 있는 동안 다음 화면을 열면 그 위로 광고가
            남기 때문이다. 닫힘까지 기다렸다가 한 번에 답한다.
          */
          if (effect === 'reward') earned = true;
          if (effect === 'end') finish(outcomeOf({ shown, earned }));
          if (effect === 'fail') finish('failed');
        },
        onError: () => finish('failed'),
      });
      // 콜백이 먼저 끝났으면 위 구독 값이 아직 없었다. 여기서 한 번 더 끊는다.
      if (settled) cancelShow();
    };

    cancelLoad = loadFullScreenAd({
      options: { adGroupId },
      onEvent: (event) => {
        // 시간이 다 돼 접은 뒤에 오는 `loaded` 는 버린다. 화면은 이미 다음으로 넘어갔다.
        if (loadCancelled) return;
        if (event.type === 'loaded') show();
      },
      onError: () => finish('failed'),
    });
    if (loadCancelled || settled) cancelLoad();
  });
}

/**
 * 링크를 만들고 시스템 공유 시트를 연다.
 *
 * 두 걸음이 반드시 이어져야 한다. 링크만 만들고 시트를 못 열면 사용자에게는 아무 일도
 * 안 일어난 것으로 보인다. 그래서 한 함수 안에 묶어 두고 중간에서 던지게 한다.
 *
 * `ogImageUrl` 은 낮은 버전(안드로이드 5.240.0 · iOS 5.239.0 아래)에서 무시된다.
 * 무시돼도 링크 자체는 만들어지므로 버전으로 가르지 않는다. 그림만 앱 기본값이 된다.
 */
class TossShareBridge implements ShareBridge {
  private readonly environment: BridgeEnvironment;

  constructor(environment: BridgeEnvironment) {
    this.environment = environment;
  }

  async send(target: ShareTarget): Promise<void> {
    try {
      const link = await Share.createLink({
        path: target.path,
        ogImageUrl: target.ogImageUrl,
      });
      // 링크만 보내면 받는 사람이 무엇인지 모르고 누른다. 한 줄을 앞에 붙인다.
      await Share.sendMessage({ message: `${target.message}\n${link}` });
      recordShare(this.environment, target);
    } catch (error) {
      throw toBridgeError(error, '공유 링크를 만들지 못했어요.');
    }
  }
}

/**
 * 만든 파일을 기기에 내려놓는다.
 *
 * SDK 는 base64 본문과 이름과 MIME 셋만 받는다. 저장 위치를 고르는 창은 토스가 띄우고
 * 우리는 결과를 받지 않는다. 그래서 부르는 쪽은 「던졌다」 까지만 세고 「사용자가 정말
 * 저장했다」 를 세지 않는다.
 */
class TossFileBridge implements FileBridge {
  private readonly environment: BridgeEnvironment;

  constructor(environment: BridgeEnvironment) {
    this.environment = environment;
  }

  async save(target: SaveFileTarget): Promise<void> {
    try {
      await TossFile.saveBase64({
        data: target.data,
        fileName: target.fileName,
        mimeType: target.mimeType,
      });
      recordFileSave(this.environment, target);
    } catch (error) {
      throw toBridgeError(error, '파일을 저장하지 못했어요.');
    }
  }
}

/**
 * 버전으로 갈리는 기능과 그 하한. 숫자는 SDK 가 들고 있는 것을 가리키기만 한다.
 *
 * 여기 없는 기능은 앱 버전과 무관하거나 SDK 가 하한을 알려 주지 않는다.
 * 별점 창은 권유 카드를 아예 안 그리는 자리라, 왜 안 뜨는지 말할 값이 있어야 한다.
 */
const VERSION_GATES: Partial<Record<BridgeCapability, { android: string; ios: string }>> = {
  notification: Notification.requestAgreement.MIN_TOSS_APP_VERSION,
  review: Review.request.MIN_TOSS_APP_VERSION,
  file: TossFile.saveBase64.MIN_TOSS_APP_VERSION,
};

export class TossMiniAppBridge implements MiniAppBridge {
  readonly environment: BridgeEnvironment;
  readonly platform: BridgePlatform;
  readonly appVersion: string;
  readonly deviceId: string;
  readonly deploymentId: string;
  readonly storage = new TossStorage();
  readonly ads = new TossAdsBridge();
  readonly analytics = new TossAnalyticsBridge();
  readonly share: ShareBridge;
  readonly file: FileBridge;

  constructor() {
    this.environment = Environment.environment;
    this.platform = Device.os;
    this.appVersion = Environment.tossAppVersion;
    this.deviceId = Environment.deviceId;
    this.deploymentId = Environment.deploymentId;
    this.share = new TossShareBridge(this.environment);
    this.file = new TossFileBridge(this.environment);
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
      case 'fullScreenAd':
        return loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
      case 'notification':
        return Notification.requestAgreement.isSupported();
      case 'analytics':
        // 낮은 버전에서는 SDK 가 조용히 무시한다. 화면이 로그 때문에 갈릴 일은 없다.
        return true;
      case 'share':
        // SDK 가 지원 여부를 알려 주지 않는다. 못 쓰는 버전이면 부를 때 던지고,
        // 그 오류를 화면이 그대로 말한다. 여기서 없는 것으로 미리 감추지 않는다.
        return true;
      case 'review':
        // 여기는 반대로 미리 감춘다. 별점 창은 **우리가 권유 카드를 먼저 띄우는** 자리라,
        // 못 뜨는 버전에서 카드만 서면 눌러도 아무 일이 안 일어난다.
        return Review.request.isSupported();
      case 'file':
        // 별점과 같다. 못 쓰는 버전에서 내보내기 버튼만 서면 눌러도 아무 일이 안 일어난다.
        return TossFile.saveBase64.isSupported();
    }
  }

  minAppVersion(capability: BridgeCapability): string | null {
    const gate = VERSION_GATES[capability];
    if (gate == null) return null;
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

  /**
   * 토스가 띄우는 별점 창.
   *
   * 결과가 없다. 별점을 남겼는지 창만 닫았는지 SDK 가 말해 주지 않아, 부르는 쪽은
   * 「물어봤다」 까지만 센다. 지원 여부는 `supports('review')` 로 미리 가른다.
   */
  async requestReview(): Promise<void> {
    if (!Review.request.isSupported()) {
      throw new BridgeError('UNSUPPORTED', '이 토스 앱 버전에서는 별점을 남길 수 없어요.');
    }
    await Review.request();
    recordReview(this.environment);
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
