import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorState } from '../shared/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * 앱이 하얗게 죽지 않게 막는 마지막 그물.
 * 화면 단위 실패는 각 화면이 자기 빈 상태로 처리하고, 여기까지 오면 통째로 다시 그린다.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // TODO: 에러 리포팅이 붙으면 여기로 보낸다. 캡처·영수증 원문은 절대 함께 보내지 않는다.
    console.error('[pocket] 화면을 그리지 못했어요', error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="shell-crash">
        <ErrorState
          title="화면을 열지 못했어요"
          description="잠시 뒤에 다시 시도해 주세요."
          onRetry={this.handleRetry}
        />
      </div>
    );
  }
}
