import { useIdentity } from '../app/providers';

import { Placeholder } from './Placeholder';

/**
 * 홈 3모드가 들어갈 자리.
 * - firstUse: 아직 기록이 하나도 없음. 기록 유도 하나만 보여준다.
 * - default: 남은 예산 히어로 + 최근 내역.
 * - recovery: 며칠 비었음. 벌주지 않고 이어서 쓰게 돕는다.
 *
 * TODO: 다음 slice 에서 거래·예산 조회를 붙여 실제 모드를 고른다. 지금은 정적 자리표시자다.
 */
type HomeMode = 'firstUse' | 'default' | 'recovery';

function IdentityNotice() {
  const { state, retry } = useIdentity();

  if (state.status === 'loading' || state.status === 'ready') return null;

  return (
    <div className="placeholder" role="status">
      <span className="placeholder__label">사용자 확인</span>
      <p style={{ margin: '0 0 10px' }}>{state.message}</p>
      {state.status === 'failed' && (
        <button type="button" className="screen-state__action" onClick={retry}>
          다시 시도
        </button>
      )}
    </div>
  );
}

export default function HomePage() {
  // TODO: 거래·예산 데이터가 붙으면 여기서 모드를 계산한다.
  const mode: HomeMode = 'default';

  return (
    <div className="page">
      <h1 className="page__title">10초 가계부</h1>
      <p className="page__lead">쓰면 바로 지금 상태가 보여요</p>

      <IdentityNotice />

      {mode === 'default' && (
        <>
          <Placeholder label="남은 예산 히어로">
            예산·남은 일수·하루 가용액이 들어간다.
          </Placeholder>
          <Placeholder label="즉시 피드백">
            방금 기록에 대한 한 줄. 초과 &gt; 주의 &gt; 큰 지출 &gt; 성취 &gt; 적정 중 하나만.
          </Placeholder>
          <Placeholder label="최근 내역">TransactionRow 목록이 들어간다.</Placeholder>
        </>
      )}

      {/*
        광고 배너는 홈 한 곳에만, 기록 CTA 위가 아닌 스크롤 영역에 붙인다.
        TODO: ads feature 가 준비되면 여기에 슬롯을 건다. 광고가 없으면 슬롯 자체를 접는다.
      */}

      <Placeholder label="기록 CTA">키패드 바텀시트를 여는 버튼이 들어간다.</Placeholder>
    </div>
  );
}
