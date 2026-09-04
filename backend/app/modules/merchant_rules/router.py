"""기억한 분류 규칙 엔드포인트."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.api.errors import ERROR_RESPONSES
from app.modules.merchant_rules import service
from app.modules.merchant_rules.schemas import MerchantRuleListOut, to_rule

router = APIRouter(prefix="/merchant-rules", tags=["merchant-rules"], responses=ERROR_RESPONSES)


@router.get("", response_model=MerchantRuleListOut)
def index(session: DbSession, user: CurrentUser) -> MerchantRuleListOut:
    return MerchantRuleListOut(items=[to_rule(row) for row in service.list_rules(session, user)])


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(rule_id: uuid.UUID, session: DbSession, user: CurrentUser) -> Response:
    service.delete_rule(session, user, rule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
