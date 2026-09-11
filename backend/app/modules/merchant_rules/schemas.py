"""기억한 분류 규칙 스키마.

규칙은 개인 것이다. 공용 사전과 섞지 않는다.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.models import MerchantRule, MerchantRuleSource

__all__ = ["MerchantRuleCreate", "MerchantRuleListOut", "MerchantRuleOut", "to_rule"]


class MerchantRuleOut(BaseModel):
    id: uuid.UUID
    # 화면에 보여 줄 표기. 없으면 정규화된 값으로 대신한다.
    merchant: str
    category_id: uuid.UUID
    # 이 규칙이 몇 번 쓰였는지.
    applied_count: int
    # 앱이 기억한 것(learned)인지 사람이 적은 것(manual)인지.
    source: MerchantRuleSource


class MerchantRuleCreate(BaseModel):
    # 정규화하면 띄어쓰기가 사라지므로 길이는 적은 그대로 잰다.
    merchant: str = Field(min_length=1, max_length=120)
    category_id: uuid.UUID


class MerchantRuleListOut(BaseModel):
    items: list[MerchantRuleOut] = Field(default_factory=list)


def to_rule(row: MerchantRule) -> MerchantRuleOut:
    return MerchantRuleOut(
        id=row.id,
        merchant=row.merchant or row.merchant_normalized,
        category_id=row.category_id,
        applied_count=row.applied_count,
        source=row.source,
    )
