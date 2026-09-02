import { Placeholder } from './Placeholder';

/** 목표 상세. P1 이라 모델만 있고 화면은 자리만 잡아 둔다. */
export default function GoalPage() {
  return (
    <div className="page">
      <h1 className="page__title">목표</h1>
      <p className="page__lead">P1 화면이에요. 지금은 자리만 잡아 뒀어요</p>

      <Placeholder label="목표 진행">모은 금액과 게이지가 들어간다.</Placeholder>
    </div>
  );
}
