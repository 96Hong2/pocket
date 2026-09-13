"""앱에 넣은 것을 전부 지운다.

되돌릴 수 없는 자리라 한 함수에 다 모아 둔다. 여기저기 흩어 두면 표가 하나 늘었을 때
어디를 함께 고쳐야 하는지 알 수 없고, 안 지워진 표가 남는다.

**사용자 행 자체는 남긴다.** 그 행은 사람이 넣은 것이 아니라 토스 익명키에서 나온
자리라, 지우면 같은 기기가 다음에 열 때 새 사람이 된다. 지우는 것은 그 사람이 넣은 것뿐이다.

소프트 삭제가 아니라 실제로 지운다. 「전부 지운다」 고 말해 놓고 행을 남기면 거짓말이 되고,
지난 기록이 리포트에서만 사라진 채 DB 에 계속 남는다.
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    AssetItem,
    AssetSnapshot,
    Budget,
    Category,
    CategoryBudget,
    Goal,
    GoalContribution,
    ImportBatch,
    ImportCandidate,
    MerchantRule,
    NotificationSetting,
    ParseUsage,
    Transaction,
    User,
    UserPreference,
)

__all__ = ["reset_data"]


def reset_data(session: Session, user: User) -> None:
    """그 사람이 넣은 것을 전부 지운다. 첫 실행 직후와 같은 상태가 된다.

    자식부터 지운다. FK 가 CASCADE 라 DB 에 맡겨도 되지만, 여기 순서대로 적어 두면
    **무엇이 함께 사라지는지**가 코드로 읽힌다. 표가 하나 늘면 이 목록이 빠진 것을 본다.
    """
    goals = select(Goal.id).where(Goal.user_id == user.id)
    session.execute(delete(GoalContribution).where(GoalContribution.goal_id.in_(goals)))
    session.execute(delete(Goal).where(Goal.user_id == user.id))

    snapshots = select(AssetSnapshot.id).where(AssetSnapshot.user_id == user.id)
    session.execute(delete(AssetItem).where(AssetItem.snapshot_id.in_(snapshots)))
    session.execute(delete(AssetSnapshot).where(AssetSnapshot.user_id == user.id))

    batches = select(ImportBatch.id).where(ImportBatch.user_id == user.id)
    session.execute(delete(ImportCandidate).where(ImportCandidate.import_batch_id.in_(batches)))
    session.execute(delete(ImportBatch).where(ImportBatch.user_id == user.id))

    session.execute(delete(Transaction).where(Transaction.user_id == user.id))

    budgets = select(Budget.id).where(Budget.user_id == user.id)
    session.execute(delete(CategoryBudget).where(CategoryBudget.budget_id.in_(budgets)))
    session.execute(delete(Budget).where(Budget.user_id == user.id))

    session.execute(delete(MerchantRule).where(MerchantRule.user_id == user.id))
    # 분석 사용량도 지운다. 남겨 두면 오늘 아무것도 없는 사람이 하루 상한에 걸린다.
    session.execute(delete(ParseUsage).where(ParseUsage.user_id == user.id))

    # 내가 만든 분류만. 기본 분류는 모두가 같이 보는 행이라 손대지 않는다.
    session.execute(delete(Category).where(Category.user_id == user.id))

    # 알림은 끈 상태로 돌아간다. 여기 익명키 원문이 들어 있어 남겨 둘 이유가 없다.
    session.execute(delete(NotificationSetting).where(NotificationSetting.user_id == user.id))
    # 설정도 기본값으로. 다음 조회가 새 행을 만들어 준다.
    session.execute(delete(UserPreference).where(UserPreference.user_id == user.id))

    session.commit()
