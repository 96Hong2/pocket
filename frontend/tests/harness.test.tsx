import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createBridge } from '../src/shared/toss';

/**
 * 테스트 하네스 자체가 살아 있는지 확인한다.
 * 여기가 깨지면 다른 모든 유닛 테스트 결과를 믿을 수 없다.
 */
describe('vitest 하네스', () => {
  it('jsdom 과 jest-dom 매처가 붙어 있다', () => {
    render(<p data-testid="probe">붙었다</p>);

    expect(screen.getByTestId('probe')).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent('붙었다');
  });

  it('앞 테스트가 그린 DOM 이 남아 있지 않다', () => {
    expect(screen.queryByTestId('probe')).toBeNull();
    expect(document.body.textContent).toBe('');
  });

  it('브라우저 환경에서는 목 브릿지가 잡힌다', async () => {
    const bridge = createBridge({ forceMock: true });

    expect(bridge.environment).toBe('browser');
    await expect(bridge.getIdentity()).resolves.toMatchObject({ source: 'mock' });
  });

  it('시나리오로 실패 상태를 주입할 수 있다', async () => {
    const bridge = createBridge({
      forceMock: true,
      scenario: { identityFailure: 'UNSUPPORTED' },
    });

    await expect(bridge.getIdentity()).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });
});
