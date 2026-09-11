"""기억한 분류 규칙 엔드포인트."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.modules.merchant_rules import service
from app.modules.merchant_rules.schemas import (
    MerchantRuleCreate,
    MerchantRuleListOut,
    MerchantRuleOut,
    to_rule,
)

router = APIRouter(prefix="/merchant-rules", tags=["merchant-rules"], responses=ERROR_RESPONSES)


@router.get("", response_model=MerchantRuleListOut)
def index(session: DbSession, user: CurrentUser) -> MerchantRuleListOut:
    return MerchantRuleListOut(items=[to_rule(row) for row in service.list_rules(session, user)])


@router.post("", response_model=MerchantRuleOut, status_code=status.HTTP_201_CREATED)
def create(body: MerchantRuleCreate, session: DbSession, user: CurrentUser) -> MerchantRuleOut:
    # 이미 있는 상호면 새로 만들지 않고 분류만 바꾼다. 그래도 201 로 답한다.
    # 화면은 "걸어 뒀다" 하나만 알면 되고, 만들었는지 덮었는지는 물어본 적이 없다.
    return to_rule(
        service.create_rule(session, user, merchant=body.merchant, category_id=body.category_id)
    )


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(rule_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_rule(session, user, rule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
