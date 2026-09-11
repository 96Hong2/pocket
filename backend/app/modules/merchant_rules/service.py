"""기억한 분류 규칙 조회·추가·삭제.

규칙은 두 곳에서 생긴다. 저장 경로(app.modules.imports)가 스스로 기억하는 것과,
사용자가 이 목록에서 직접 적어 넣는 것이다. 어느 쪽인지는 `source` 가 들고 있다.

지울 수 없는 기억은 기억이 아니라 굳은 규칙이라, 둘 다 같은 방법으로 지운다.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.domain.fingerprint import normalize_merchant
from app.models import Category, MerchantRule, MerchantRuleSource, User
from app.modules.categories import service as categories

__all__ = ["create_rule", "delete_rule", "list_rules"]


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
        # 손으로 건 것이 맨 위다. 방금 적어 넣은 규칙이 스무 번 맞은 규칙 아래로 밀리면
        # 목록이 길 때 자기가 방금 한 일을 못 찾는다. 그 안에서는 자주 맞은 순,
        # 같으면 이름 순이라 순서가 흔들리지 않는다.
        .order_by(
            (MerchantRule.source == MerchantRuleSource.MANUAL).desc(),
            MerchantRule.applied_count.desc(),
            MerchantRule.merchant_normalized,
        )
    )
    return list(session.scalars(stmt))


def create_rule(
    session: Session, user: User, *, merchant: str, category_id: uuid.UUID
) -> MerchantRule:
    """상호 하나에 분류를 손으로 걸어 둔다.

    같은 상호가 이미 있으면 새로 만들지 않고 그 규칙의 분류를 바꾼다. 상호 하나에 규칙은
    하나라는 규칙이 DB 제약이기도 하다. 지웠던 상호를 다시 적으면 되살아난다.

    직접 적은 규칙은 `applied_count` 를 올리지 않는다. 이 값은 실제로 몇 번 맞았는지라,
    적기만 한 규칙이 자주 쓰인 규칙보다 위에 서면 목록 순서가 거짓이 된다.
    """
    normalized = normalize_merchant(merchant)
    if not normalized:
        raise ApiError(ErrorCode.INVALID_REQUEST, "상호를 적어 주세요.", status_code=422)

    categories.require_owned(session, user, category_id)
    display = merchant.strip()

    existing = session.scalars(
        select(MerchantRule).where(
            MerchantRule.user_id == user.id,
            MerchantRule.merchant_normalized == normalized,
        )
    ).first()
    if existing is not None:
        existing.deleted_at = None
        existing.merchant = display
        existing.category_id = category_id
        existing.source = MerchantRuleSource.MANUAL
        session.commit()
        session.refresh(existing)
        return existing

    row = MerchantRule(
        user_id=user.id,
        merchant_normalized=normalized,
        merchant=display,
        category_id=category_id,
        source=MerchantRuleSource.MANUAL,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def delete_rule(session: Session, user: User, rule_id: uuid.UUID) -> None:
    row = session.get(MerchantRule, rule_id)
    if row is None or row.user_id != user.id or row.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, "규칙을 찾지 못했어요.", status_code=404)
    row.deleted_at = datetime.now(UTC)
    session.commit()
