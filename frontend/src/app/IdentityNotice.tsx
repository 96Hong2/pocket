import { ErrorState, UnsupportedFeature } from '../shared/ui';

import { useIdentity } from './providers';

/**
 * 익명 식별키를 못 받은 상태를 알린다.
 *
 * 앱은 떠 있지만 저장과 조회가 전부 막힌다. 이 안내가 없으면 어느 화면이든
 * "불러오는 중" 에서 멈춘 것처럼 보인다. 그래서 홈뿐 아니라 조회하는 화면이 같이 쓴다.
 */
export function IdentityNotice() {
  const { state, retry } = useIdentity();

  if (state.status === 'unsupported') {
    return <UnsupportedFeature feature="기록 저장" description={state.message} />;
  }
  if (state.status === 'failed') {
    return (
      <ErrorState
        title="사용자 확인을 마치지 못했어요"
        description={state.message}
        onRetry={retry}
      />
    );
  }
  return null;
}
