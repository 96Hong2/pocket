import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { BridgeProvider } from '../src/app/providers';
import { CaptureTab } from '../src/features/imports';
import { ApiContext, createApiClient } from '../src/shared/api';
import { createBridge, type MockScenario } from '../src/shared/toss';

/**
 * 앨범을 열지 못하는 세 갈래.
 *
 * ⚠ 여기서 보는 것은 **우리 목 브릿지**다. 실기기의 `Device.getPhotos` 가 정말 이렇게
 * 동작하는지는 증명하지 못한다. 특히 취소를 실기기가 빈 배열로 주는지 예외로 주는지 확인하지
 * 못했다. e2e 는 devtools 목에 사진을 심는 경로라 취소라는 개념이 없어 여기서만 본다.
 */

function renderCaptureTab(scenario: MockScenario) {
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

  return render(<CaptureTab onBusyChange={() => {}} onDone={() => {}} />, { wrapper: Wrapper });
}

describe('캡처 탭에서 앨범이 열리지 않을 때', () => {
  it('아무것도 안 고르고 닫으면 아무 말도 하지 않는다', async () => {
    renderCaptureTab({ album: 'cancel' });

    await userEvent.click(screen.getByRole('button', { name: '캡처 고르기' }));

    // 사용자가 스스로 그만둔 것이다. 오류로 말하면 잘못한 것처럼 읽힌다.
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getByText(/거래내역 캡처를 골라주세요/)).toBeInTheDocument();
  });

  it('사진 접근이 꺼져 있으면 무엇이 꺼졌는지 말한다', async () => {
    renderCaptureTab({ album: 'denied' });

    await userEvent.click(screen.getByRole('button', { name: '캡처 고르기' }));

    expect(screen.getByText('사진 접근이 꺼져 있어요')).toBeInTheDocument();
  });

  it('앨범을 못 여는 앱 버전이면 업데이트하라고 말한다', () => {
    renderCaptureTab({ unsupported: ['albumPick'] });

    expect(screen.getByText('이 버전에서는 아직 안 되는 기능이에요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '캡처 고르기' })).toBeNull();
  });
});
