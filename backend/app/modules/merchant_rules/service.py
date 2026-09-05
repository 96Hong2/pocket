"""기억한 분류 규칙 조회와 삭제.

규칙을 만드는 것은 저장 경로(app.modules.imports)가 한다.
여기서는 사용자가 목록을 보고 지우는 길만 연다. 지울 수 없는 기억은 기억이 아니라 굳은 규칙이다.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.models import Category, MerchantRule, User

__all__ = ["delete_rule", "list_rules"]


def list_rules(session: Session, user: User) -> list[MerchantRule]:
    stmt = (
        select(MerchantRule)
        # 지운 분류를 가리키는 규칙은 뺀다. 이름을 못 그리고, 저장에 붙으면 통째로 거절된다.
        .join(Category, Category.id == MerchantRule.category_id)
        .where(
            MerchantRule.user_id == user.id,
            MerchantRule.deleted_at.is_(None),
            Category.deleted_at.is_(None),
        )
        # 자주 맞은 것이 위로 온다. 같으면 이름 순이라 순서가 흔들리지 않는다.
        .order_by(MerchantRule.applied_count.desc(), MerchantRule.merchant_normalized)
    )
    return list(session.scalars(stmt))


def delete_rule(session: Session, user: User, rule_id: uuid.UUID) -> None:
    row = session.get(MerchantRule, rule_id)
    if row is None or row.user_id != user.id or row.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, "규칙을 찾지 못했어요.", status_code=404)
    row.deleted_at = datetime.now(UTC)
    session.commit()
