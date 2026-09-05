import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

/**
 * 앱인토스 devtools 목의 앨범 다이얼을 돌린다.
 *
 * 앨범은 네이티브 기능이라 브라우저에서 열 수 없다. 목이 `deviceModes.photos = 'mock'` 일 때
 * `mockData.images` 를 그대로 돌려주므로, 그 자리에 고정 사진 한 장을 심어 "골랐다" 를 만든다.
 * 브릿지 코드(`tossBridge.pickPhotos`)는 실기기와 같은 것이 그대로 돈다.
 *
 * `deviceModes.photos` 를 'web' 으로 두면 파일 선택 다이얼로그가 뜨고 취소가 예외로 와서
 * 우리 계약(취소는 빈 배열)과 어긋난다. 'mock' 을 유지한다.
 *
 * 목 내부 구조(`window.__ait`)에 기대는 코드라 devtools 를 올리면 여기가 먼저 조용히 깨진다.
 * 그래서 다이얼마다 "실제로 걸렸는지" 를 확인하는 짝을 함께 둔다.
 */

interface AitManager {
  state?: {
    mockData?: { images?: string[] };
    permissions?: { photos?: string };
  };
  patch?: (slice: string, partial: Record<string, unknown>) => void;
}

/** 앨범에서 고른 척할 사진 한 장. 스텁은 바이트를 안 보므로 내용은 아무래도 좋다. */
export const CAPTURE_DATA_URI = toDataUri('../fixtures/capture.png');

/**
 * 앨범이 돌려줄 사진을 심는다. `page.addInitScript` 로 넘긴다.
 *
 * 본문은 브라우저에서 돈다. 바깥 스코프를 참조하면 안 된다.
 * 목이 붙는 순간을 놓치지 않게 짧은 주기로 확인만 하고, 값이 박히면 멈춘다.
 */
export function seedAlbumPhotos(dataUri: string): (page: Page) => Promise<void> {
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
export async function albumPhotosSeeded(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as unknown as { __ait?: AitManager }).__ait?.state?.mockData?.images?.length === 1,
  );
}

/** 사진 접근을 거부로 돌린다. 목이 실제 SDK 와 같은 PermissionError 를 던진다. */
export function denyPhotoPermission(): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(() => {
      interface Manager {
        state?: { permissions?: { photos?: string } };
        patch?: (slice: string, partial: Record<string, unknown>) => void;
      }

      const deadline = Date.now() + 10_000;
      const timer = setInterval(() => {
        const manager = (window as unknown as { __ait?: Manager }).__ait;
        if (manager?.state?.permissions?.photos === 'denied' || Date.now() > deadline) {
          clearInterval(timer);
          return;
        }
        manager?.patch?.('permissions', { photos: 'denied' });
      }, 1);
    });
  };
}

/** 권한 다이얼이 실제로 거부로 돌아갔는지. */
export async function photoPermissionDenied(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as unknown as { __ait?: AitManager }).__ait?.state?.permissions?.photos === 'denied',
  );
}

function toDataUri(relative: string): string {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
}
