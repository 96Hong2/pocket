"""앱에 넣은 것을 전부 지운다.

되돌릴 수 없는 자리라 한 함수에 다 모아 둔다. 여기저기 흩어 두면 표가 하나 늘었을 때
어디를 함께 고쳐야 하는지 알 수 없고, 안 지워진 표가 남는다.

**사용자 행 자체는 남긴다.** 그 행은 사람이 넣은 것이 아니라 토스 익명키에서 나온
자리라, 지우면 같은 기기가 다음에 열 때 새 사람이 된다. 지우는 것은 그 사람이 넣은 것뿐이다.

**사람이 쌓은 것은 접어만 둔다(soft delete).** 화면에서는 전부 사라지지만 행은 남는다.
한 번 잘못 누르면 몇 달치가 통째로 날아가는 자리인데, 지금은 되살릴 길이 아무 데도 없다.
접어 두면 그 길이 생긴다. 대신 화면이 「되돌릴 수 없어요」 라고 말하면 안 된다.

**연령대·성별은 지우지 않는다.** 사람을 가리키는 값이 아니라 어떤 사람들이 쓰는지 보는
값이고, 다시 물으면 처음 안내를 또 보여야 한다. 열람·정정 요구가 오면 그때 손으로 지운다.

접지 않고 진짜로 지우는 것도 있다. 남겨 두면 그 자체로 해로운 것들이다. 무엇을 왜 지우는지는
아래 함수 안에 줄마다 적어 둔다.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import ColumnElement, delete, select, update
from sqlalchemy.orm import Session

from app.db.base import SoftDeleteMixin
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
    """그 사람이 넣은 것을 접는다. 화면은 첫 실행 직후와 같은 상태가 된다.

    자식부터 훑는다. 접는 것과 지우는 것을 한 함수에 나란히 두어, 표가 하나 늘었을 때
    **어느 쪽에 넣어야 하는지**가 눈에 보이게 한다.
    """
    now = datetime.now(UTC)

    def fold(model: type[SoftDeleteMixin], *where: ColumnElement[bool]) -> None:
        """아직 살아 있는 행에만 지운 표시를 찍는다. 이미 접힌 것의 날짜를 덮지 않는다."""
        session.execute(
            update(model).where(*where, model.deleted_at.is_(None)).values(deleted_at=now)
        )

    # ── 접어 둔다: 사람이 손으로 쌓은 것 ─────────────────────────────
    # 같은 이름·같은 달을 다시 만들면 이 행이 되살아난다(ADR-0008). 자리를 잡고 있어도
    # 막히지 않는 이유가 그것이다.
    goals = select(Goal.id).where(Goal.user_id == user.id)
    fold(GoalContribution, GoalContribution.goal_id.in_(goals))
    fold(Goal, Goal.user_id == user.id)

    snapshots = select(AssetSnapshot.id).where(AssetSnapshot.user_id == user.id)
    fold(AssetItem, AssetItem.snapshot_id.in_(snapshots))
    fold(AssetSnapshot, AssetSnapshot.user_id == user.id)

    fold(Transaction, Transaction.user_id == user.id)

    budgets = select(Budget.id).where(Budget.user_id == user.id)
    fold(CategoryBudget, CategoryBudget.budget_id.in_(budgets))
    fold(Budget, Budget.user_id == user.id)

    fold(MerchantRule, MerchantRule.user_id == user.id)

    # 내가 만든 분류만. 기본 분류는 모두가 같이 보는 행이라 손대지 않는다.
    fold(Category, Category.user_id == user.id)

    # ── 진짜로 지운다: 남겨 두면 해로운 것 ───────────────────────────
    # 저장 전 임시 후보다. 되살릴 값이 아니고, 읽어 들인 원본 조각이 여기 붙어 있다.
    batches = select(ImportBatch.id).where(ImportBatch.user_id == user.id)
    session.execute(delete(ImportCandidate).where(ImportCandidate.import_batch_id.in_(batches)))
    session.execute(delete(ImportBatch).where(ImportBatch.user_id == user.id))

    # 분석 사용량. 남겨 두면 오늘 아무것도 없는 사람이 하루 상한에 걸린다.
    session.execute(delete(ParseUsage).where(ParseUsage.user_id == user.id))

    # 알림은 끈 상태로 돌아간다. 여기 익명키 원문이 들어 있어 남겨 둘 이유가 없다.
    session.execute(delete(NotificationSetting).where(NotificationSetting.user_id == user.id))

    # 설정도 기본값으로. 다음 조회가 새 행을 만들어 준다.
    session.execute(delete(UserPreference).where(UserPreference.user_id == user.id))

    session.commit()
