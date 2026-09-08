import { IdentityNotice } from '../app/IdentityNotice';
import { GoalBoard } from '../features/goals';

/** 목표. 진행 중인 목표 하나를 보고 모은 돈을 더한다. */
export default function GoalPage() {
  return (
    <div className="page">
      <h1 className="page__title">목표</h1>
      <p className="page__lead">모으고 싶은 것 하나만 정해요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 카드 자리가 계속 회색이다. */}
      <IdentityNotice />

      <GoalBoard />
    </div>
  );
}
