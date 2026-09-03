import {
  BridgeError,
  type AdsBridge,
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
  type PickPhotosOptions,
  type PickedImage,
  type SafeAreaInsets,
} from './types';

/**
 * 브라우저·테스트용 브릿지.
 *
 * 토스 앱 밖에서도 앱 전체를 돌려볼 수 있게 한다. e2e 테스트는 이 브릿지의 시나리오를 바꿔
 * 권한 거부·미지원·NoFill 같은 엣지 상태를 실제 화면으로 재현한다.
 */
export interface MockScenario {
  /** getIdentity 가 던질 에러. 없으면 성공한다. */
  identityFailure?: 'UNSUPPORTED' | 'UNKNOWN';
  /** 앨범 선택 결과. 'denied' 는 권한 거부, 'cancel' 은 빈 배열. */
  album?: 'ok' | 'denied' | 'cancel';
  camera?: 'ok' | 'denied' | 'cancel';
  network?: NetworkStatus;
  /** 지원하지 않는다고 답할 기능들. */
  unsupported?: BridgeCapability[];
  ads?: 'ok' | 'noFill' | 'failed' | 'unsupported';
}

/** 1x1 투명 PNG. 실제 이미지 없이 파이프라인을 태우기 위한 자리표시자다. */
const BLANK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

class MemoryStorage implements KeyValueStore {
  private readonly prefix = 'pocket:mock:';

  async get(key: string) {
    try {
      return globalThis.localStorage?.getItem(this.prefix + key) ?? null;
    } catch {
      return null;
    }
  }
  async set(key: string, value: string) {
    try {
      globalThis.localStorage?.setItem(this.prefix + key, value);
    } catch {
      /* 시크릿 모드 등에서 막히면 조용히 넘어간다. 저장소는 편의 기능이다. */
    }
  }
  async remove(key: string) {
    try {
      globalThis.localStorage?.removeItem(this.prefix + key);
    } catch {
      /* 위와 같음 */
    }
  }
}

class MockAdsBridge implements AdsBridge {
  private readonly scenario: MockScenario;

  constructor(scenario: MockScenario) {
    this.scenario = scenario;
  }

  async initialize(): Promise<void> {
    if (this.scenario.ads === 'unsupported') {
      throw new BridgeError('UNSUPPORTED', '목: 이 환경에서는 배너 광고를 쓸 수 없어요.');
    }
  }

  attachBanner(
    _adGroupId: string,
    target: HTMLElement,
    options: AttachBannerOptions = {},
  ): BannerHandle {
    const mode = this.scenario.ads ?? 'ok';
    if (mode === 'noFill') {
      queueMicrotask(() => options.onNoFill?.());
      return { destroy: () => {} };
    }
    if (mode === 'failed' || mode === 'unsupported') {
      queueMicrotask(() => options.onFailed?.('목: 광고를 그리지 못했어요.'));
      return { destroy: () => {} };
    }

    // 실제 배너와 같은 규격으로 자리만 채운다.
    // 우리가 라벨·테두리를 그리면 정책(광고 UI 임의 수정)에 걸리고,
    // 높이가 다르면 e2e 로 잡은 레이아웃이 실기기에서 어긋난다.
    const node = document.createElement('div');
    node.dataset.testid = 'mock-ad-banner';
    node.style.cssText = 'width:100%;height:100%;min-height:96px';
    target.appendChild(node);
    queueMicrotask(() => options.onRendered?.('mock-slot-1'));
    return { destroy: () => node.remove() };
  }
}

export class MockMiniAppBridge implements MiniAppBridge {
  readonly environment: BridgeEnvironment = 'browser';
  readonly platform: BridgePlatform = 'web';
  readonly appVersion = '';
  readonly storage = new MemoryStorage();
  readonly ads: AdsBridge;

  private accessoryListeners = new Set<(id: string) => void>();
  private backListeners = new Set<() => void>();
  private accessory: NavigationAccessory | null = null;
  private closed = false;
  private readonly scenario: MockScenario;

  constructor(scenario: MockScenario = {}) {
    this.scenario = scenario;
    this.ads = new MockAdsBridge(scenario);
  }

  supports(capability: BridgeCapability): boolean {
    if (this.scenario.unsupported?.includes(capability)) return false;
    if (capability === 'ads') return this.scenario.ads !== 'unsupported';
    return true;
  }

  async getIdentity(): Promise<Identity> {
    if (this.scenario.identityFailure) {
      throw new BridgeError(this.scenario.identityFailure, '목: 사용자 정보를 확인하지 못했어요.');
    }
    // 브라우저에서 새로고침해도 같은 사용자로 남게 저장한다.
    const saved = await this.storage.get('identity');
    if (saved) return { key: saved, source: 'mock' };
    const key = `mock-${Math.random().toString(36).slice(2, 12)}`;
    await this.storage.set('identity', key);
    return { key, source: 'mock' };
  }

  async pickPhotos(options: PickPhotosOptions = {}): Promise<PickedImage[]> {
    const mode = this.scenario.album ?? 'ok';
    if (mode === 'denied') {
      throw new BridgeError('PERMISSION_DENIED', '목: 앨범 권한이 없어요.');
    }
    if (mode === 'cancel') return [];
    const count = Math.min(options.maxCount ?? 1, 3);
    return Array.from({ length: count }, (_, i) => ({
      id: `mock-photo-${i}`,
      dataUri: BLANK_PNG,
    }));
  }

  async captureReceipt(_options: CaptureOptions = {}): Promise<PickedImage | null> {
    const mode = this.scenario.camera ?? 'ok';
    if (mode === 'denied') {
      throw new BridgeError('PERMISSION_DENIED', '목: 카메라 권한이 없어요.');
    }
    if (mode === 'cancel') return null;
    return { id: 'mock-receipt', dataUri: BLANK_PNG };
  }

  getSafeAreaInsets(): SafeAreaInsets {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  subscribeSafeArea(): () => void {
    return () => {};
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return this.scenario.network ?? 'WIFI';
  }

  async setNavigationAccessory(accessory: NavigationAccessory | null): Promise<void> {
    this.accessory = accessory;
  }

  onNavigationAccessoryPress(listener: (id: string) => void): () => void {
    this.accessoryListeners.add(listener);
    return () => this.accessoryListeners.delete(listener);
  }

  subscribeBackPress(listener: () => void): () => void {
    this.backListeners.add(listener);
    return () => this.backListeners.delete(listener);
  }

  async closeApp(): Promise<void> {
    this.closed = true;
  }

  /** 테스트에서 상단 액세서리 버튼 클릭을 흉내낼 때 쓴다. */
  pressNavigationAccessory(): void {
    if (this.accessory == null) return;
    for (const listener of this.accessoryListeners) listener(this.accessory.id);
  }

  /** 테스트에서 시스템 뒤로가기를 흉내낼 때 쓴다. */
  pressBack(): void {
    for (const listener of this.backListeners) listener();
  }

  /** closeApp 이 불렸는지 테스트에서 확인한다. */
  get isClosed(): boolean {
    return this.closed;
  }
}
