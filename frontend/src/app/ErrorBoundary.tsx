import { Component, type ContextType, type ErrorInfo, type ReactNode } from 'react';

import { AnalyticsContext, EVENTS } from '../shared/analytics';
import { ErrorState } from '../shared/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 화면 안쪽에서만 대신할 때. 껍데기(탭바·뒤로가기)를 살려 둔다. */
  variant?: 'app' | 'screen';
}

interface ErrorBoundaryState {
  hasError: boolean;
  /** 화면 파일을 받다가 실패한 경우. 다시 그리는 것으로는 회복되지 않는다. */
  needsReload: boolean;
}

/**
 * 화면 파일을 받다가 실패했나.
 *
 * lazy 라우트는 청크를 따로 받는다. 그 요청이 실패하면 `import()` 가 실패로 굳어서
 * 같은 컴포넌트를 다시 그려도 같은 실패가 즉시 돌아온다. '다시 시도' 가 영구히 무력해진다.
 * 그때만 문서를 다시 받아야 회복된다.
 */
function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|Loading chunk|Importing a module script failed/i.test(
    `${error.name} ${error.message}`,
  );
}

/**
 * 앱이 하얗게 죽지 않게 막는 마지막 그물.
 * 화면 단위 실패는 각 화면이 자기 빈 상태로 처리하고, 여기까지 오면 통째로 다시 그린다.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  /*
    클래스라 훅을 못 쓴다. 로거는 컨텍스트로 받는다.

    앱 바깥(프로바이더 위)에 놓인 바운더리도 있어서 null 일 수 있다. 그때는 로그만 없고
    화면은 그대로 산다. 로그 때문에 마지막 그물이 찢어지면 안 된다.
  */
  static contextType = AnalyticsContext;
  declare context: ContextType<typeof AnalyticsContext>;

  state: ErrorBoundaryState = { hasError: false, needsReload: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, needsReload: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[pocket] 화면을 그리지 못했어요', error, info.componentStack);
    /*
      무엇이 죽었는지만 남긴다.

      **메시지 본문과 스택은 보내지 않는다.** 화면이 죽는 자리는 대개 사용자가 방금 넣은
      값을 다루던 자리라, 예외 메시지에 금액·상호·캡처 조각이 실려 있을 수 있다.
      이름과 어느 화면인지면 어디를 봐야 할지는 정해진다.
    */
    this.context?.log(EVENTS.clientError, {
      kind: this.props.variant ?? 'app',
      error_name: error.name,
      needs_reload: isChunkLoadError(error),
      screen: document.title,
    });
  }

  handleRetry = (): void => {
    if (this.state.needsReload) {
      // 받다 실패한 화면 파일은 다시 그려도 같은 실패가 즉시 돌아온다.
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, needsReload: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const description = this.state.needsReload
      ? '화면을 받다가 끊겼어요. 다시 시도하면 새로 받아요.'
      : '잠시 뒤에 다시 시도해 주세요.';

    return (
      <div className={this.props.variant === 'screen' ? 'shell-crash--inline' : 'shell-crash'}>
        <ErrorState
          title="화면을 열지 못했어요"
          description={description}
          onRetry={this.handleRetry}
        />
      </div>
    );
  }
}
