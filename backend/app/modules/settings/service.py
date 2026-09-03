"""사용자 설정 조회·수정.

첫 기록 전에 아무것도 묻지 않으므로 모든 값에 기본값이 있고, 설정 행 자체가
없을 수도 있다. 그래서 조회가 없으면 만들어 준다. 화면이 404 를 만나지 않는다.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User, UserPreference

__all__ = ["get_preferences", "update_preferences"]


def _find(session: Session, user: User) -> UserPreference | None:
    return session.scalar(select(UserPreference).where(UserPreference.user_id == user.id))


def get_preferences(session: Session, user: User) -> UserPreference:
    """설정 행이 없으면 기본값으로 만들어 준다."""
    row = _find(session, user)
    if row is not None:
        return row

    row = UserPreference(user_id=user.id)
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        # 화면이 설정과 예산을 동시에 부르면 같은 행을 둘이 만들려 한다. 이긴 행을 쓴다.
        session.rollback()
        existing = _find(session, user)
        if existing is None:
            raise
        return existing
    session.refresh(row)
    return row


def update_preferences(session: Session, user: User, data: dict) -> UserPreference:
    row = get_preferences(session, user)
    for field, value in data.items():
        setattr(row, field, value)
    session.commit()
    session.refresh(row)
    return row
