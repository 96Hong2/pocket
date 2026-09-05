import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

/**
 * 앱인토스 devtools 목의 앨범·카메라 다이얼을 돌린다.
 *
 * 앨범도 카메라도 네이티브 기능이라 브라우저에서 열 수 없다. 목이
 * `deviceModes.photos`·`deviceModes.camera` 가 'mock' 일 때 **같은** `mockData.images` 를
 * 돌려주므로, 그 자리에 사진 한 장을 심어 "골랐다"·"찍었다" 를 만든다.
 * 브릿지 코드(`tossBridge.pickPhotos`·`captureReceipt`)는 실기기와 같은 것이 그대로 돈다.
 *
 * `deviceModes` 를 'web' 으로 두면 파일 선택 다이얼로그가 뜨고 취소가 예외로 와서
 * 우리 계약(취소는 빈 값)과 어긋난다. 'mock' 을 유지한다.
 *
 * 목 내부 구조(`window.__ait`)에 기대는 코드라 devtools 를 올리면 여기가 먼저 조용히 깨진다.
 * 그래서 다이얼마다 "실제로 걸렸는지" 를 확인하는 짝을 함께 둔다.
 */

interface AitManager {
  state?: {
    mockData?: { images?: string[] };
    permissions?: { photos?: string; camera?: string };
  };
  patch?: (slice: string, partial: Record<string, unknown>) => void;
}

/** 가져온 척할 사진 한 장. 스텁은 바이트를 안 보므로 내용은 아무래도 좋다. */
export const CAPTURE_DATA_URI = toDataUri('../fixtures/capture.png');

/**
 * 촬영을 취소한 것으로 만드는 값.
 *
 * 목의 `getMockImages()` 는 배열이 **비었을 때만** 기본 그림으로 바꿔치기하므로,
 * 빈 문자열 한 개는 그대로 통과한다. 그러면 `openCameraMock()` 이 `dataUri: ''` 를 내고,
 * 그 값이 `tossBridge.captureReceipt` 의 `image?.dataUri ? ... : null` 을 지나 null 이 된다.
 * 즉 실기기와 같은 브릿지 코드로 취소가 만들어진다.
 *
 * ⚠ 실기기가 취소를 정말 빈 dataUri 로 주는지는 확인하지 못했다. SDK 타입에 적혀 있지 않고,
 * 같은 devtools 의 web 모드는 예외로 던진다. 우리 분기가 옳게 도는 것까지만 증명한다.
 */
export const CANCELLED_SHOT = '';

/**
 * 앨범·카메라가 돌려줄 사진을 심는다. `page.addInitScript` 로 넘긴다.
 *
 * 본문은 브라우저에서 돈다. 바깥 스코프를 참조하면 안 된다.
 * 목이 붙는 순간을 놓치지 않게 짧은 주기로 확인만 하고, 값이 박히면 멈춘다.
 */
export function seedMockImages(dataUri: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript((uri: string) => {
      interface Manager {
        state?: { mockData?: { images?: string[] } };
        patch?: (slice: string, partial: Record<string, unknown>) => void;
      }

      const deadline = Date.now() + 10_000;
      const timer = setInterval(() => {
        const manager = (window as unknown as { __ait?: Manager }).__ait;
        if (manager?.state?.mockData?.images?.length === 1 || Date.now() > deadline) {
          clearInterval(timer);
          return;
        }
        manager?.patch?.('mockData', { images: [uri] });
      }, 1);
    }, dataUri);
  };
}

/** 사진이 실제로 심겼는지. 안 심겼으면 목이 만든 기본 그림 세 장을 보고 있는 것이다. */
export async function mockImagesSeeded(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as unknown as { __ait?: AitManager }).__ait?.state?.mockData?.images?.length === 1,
  );
}

/** 사진 접근을 거부로 돌린다. 목이 실제 SDK 와 같은 PermissionError 를 던진다. */
export function denyPhotoPermission(): (page: Page) => Promise<void> {
  return denyPermission('photos');
}

/** 사진 권한 다이얼이 실제로 거부로 돌아갔는지. */
export async function photoPermissionDenied(page: Page): Promise<boolean> {
  return permissionDenied(page, 'photos');
}

/** 카메라 접근을 거부로 돌린다. 목이 OpenCameraPermissionError 를 던진다. */
export function denyCameraPermission(): (page: Page) => Promise<void> {
  return denyPermission('camera');
}

/** 카메라 권한 다이얼이 실제로 거부로 돌아갔는지. */
export async function cameraPermissionDenied(page: Page): Promise<boolean> {
  return permissionDenied(page, 'camera');
}

/** 사진과 카메라는 목에서도 별개 키다. 하나를 꺼도 다른 하나는 그대로 열려 있다. */
function denyPermission(resource: 'photos' | 'camera'): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript((key: string) => {
      interface Manager {
        state?: { permissions?: Record<string, string> };
        patch?: (slice: string, partial: Record<string, unknown>) => void;
      }

      const deadline = Date.now() + 10_000;
      const timer = setInterval(() => {
        const manager = (window as unknown as { __ait?: Manager }).__ait;
        if (manager?.state?.permissions?.[key] === 'denied' || Date.now() > deadline) {
          clearInterval(timer);
          return;
        }
        manager?.patch?.('permissions', { [key]: 'denied' });
      }, 1);
    }, resource);
  };
}

function permissionDenied(page: Page, resource: 'photos' | 'camera'): Promise<boolean> {
  return page.evaluate(
    (key: string) =>
      (window as unknown as { __ait?: AitManager }).__ait?.state?.permissions?.[
        key as 'photos' | 'camera'
      ] === 'denied',
    resource,
  );
}

function toDataUri(relative: string): string {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
}
