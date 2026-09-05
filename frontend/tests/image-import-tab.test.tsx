import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { BridgeProvider } from '../src/app/providers';
import { ImageImportTab, type ImageImportKind } from '../src/features/imports';
import { ApiContext, createApiClient } from '../src/shared/api';
import { createBridge, type MockScenario } from '../src/shared/toss';

/**
 * 사진을 가져오지 못하는 세 갈래. 캡처(앨범)와 영수증(카메라) 양쪽을 같은 표로 본다.
 *
 * ⚠ 여기서 보는 것은 **우리 목 브릿지**다. 실기기의 `Device.getPhotos`·`Device.openCamera` 가
 * 정말 이렇게 동작하는지는 증명하지 못한다. 특히 취소를 실기기가 빈 값으로 주는지 예외로 주는지
 * 확인하지 못했다. e2e 는 devtools 목을 쓰므로 권한 거부와 촬영 취소를 실제 브릿지 코드로
 * 지나가지만, 앨범 취소와 미지원 버전은 이 목에서만 볼 수 있다.
 */

function renderTab(kind: ImageImportKind, scenario: MockScenario) {
  const bridge = createBridge({ forceMock: true, scenario });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const api = {
    client: createApiClient({ getAnonKey: () => ({ status: 'ready' as const, key: 'test' }) }),
    isReady: true,
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <BridgeProvider bridge={bridge}>
        <ApiContext.Provider value={api}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ApiContext.Provider>
      </BridgeProvider>
    );
  }

  return render(<ImageImportTab kind={kind} onBusyChange={() => {}} onDone={() => {}} />, {
    wrapper: Wrapper,
  });
}

/** 두 탭이 같은 세 갈래를 각자의 자원·문구로 지난다. */
const MODES = [
  {
    kind: 'capture' as const,
    scenarioKey: 'album' as const,
    capability: 'albumPick' as const,
    button: '캡처 고르기',
    guide: /거래내역 캡처를 골라주세요/,
    deniedTitle: '사진 접근이 꺼져 있어요',
  },
  {
    kind: 'receipt' as const,
    scenarioKey: 'camera' as const,
    capability: 'camera' as const,
    button: '영수증 찍기',
    guide: /영수증이 잘 보이게 찍어주세요/,
    deniedTitle: '카메라 접근이 꺼져 있어요',
  },
];

describe.each(MODES)('$kind 탭에서 사진을 가져오지 못할 때', (mode) => {
  it('아무것도 안 고르고 닫으면 아무 말도 하지 않는다', async () => {
    renderTab(mode.kind, { [mode.scenarioKey]: 'cancel' });

    await userEvent.click(screen.getByRole('button', { name: mode.button }));

    // 사용자가 스스로 그만둔 것이다. 오류로 말하면 잘못한 것처럼 읽힌다.
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getByText(mode.guide)).toBeInTheDocument();
  });

  it('접근이 꺼져 있으면 무엇이 꺼졌는지 말한다', async () => {
    renderTab(mode.kind, { [mode.scenarioKey]: 'denied' });

    await userEvent.click(screen.getByRole('button', { name: mode.button }));

    // 사진과 카메라는 다른 권한이다. 뭉뚱그리면 사용자가 무엇을 켜야 할지 모른다.
    expect(screen.getByText(mode.deniedTitle)).toBeInTheDocument();
  });

  it('못 여는 앱 버전이면 업데이트하라고 말한다', () => {
    renderTab(mode.kind, { unsupported: [mode.capability] });

    expect(screen.getByText('이 버전에서는 아직 안 되는 기능이에요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: mode.button })).toBeNull();
  });
});
