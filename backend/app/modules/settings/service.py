"""사용자 설정 조회·수정.

첫 기록 전에 아무것도 묻지 않으므로 모든 값에 기본값이 있고, 설정 행 자체가
없을 수도 있다. 그래서 조회가 없으면 만들어 준다. 화면이 404 를 만나지 않는다.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.aggregation import TransactionSource
from app.models import User, UserPreference
from app.models.preference import RecordMethod

__all__ = ["get_preferences", "remember_record_method", "update_preferences"]

# 기록 시트에 탭이 있는 입력 경로만 기억한다. 자산 캡처와 무지출일은 그 시트에서 오지 않아
# 여기 넣으면 다음에 열 수 없는 탭을 가리키게 된다.
_METHOD_BY_SOURCE: dict[TransactionSource, RecordMethod] = {
    TransactionSource.KEYPAD: RecordMethod.KEYPAD,
    TransactionSource.NL: RecordMethod.NL,
    TransactionSource.SCREENSHOT: RecordMethod.SCREENSHOT,
    TransactionSource.RECEIPT: RecordMethod.RECEIPT,
}


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
    """값이 None 인 항목은 건너뛴다. 필드를 빼는 것과 null 을 보내는 것이 같다.

    전부 기본값이 있는 컬럼이라 '값 없음' 을 저장할 자리가 없다. null 을 그대로 넣으면
    제약 위반이 나서, 화면은 형식 오류 대신 '다시 시도해 주세요' 를 보게 된다.
    """
    row = get_preferences(session, user)
    for field, value in data.items():
        if value is None:
            continue
        setattr(row, field, value)
    session.commit()
    session.refresh(row)
    return row


def remember_record_method(session: Session, user: User, source: TransactionSource) -> None:
    """다음에 기록 시트를 어느 탭으로 열지 남긴다. 거래를 저장한 뒤에 부른다.

    저장이 끝난 다음이라 여기서 커밋해도 거래가 반쪽으로 남지 않는다. 반대로 저장 전에
    부르면 이 커밋이 아직 검증 중인 거래까지 함께 밀어 넣는다.

    값이 그대로면 아무것도 쓰지 않는다. 여러 건을 한 번에 저장하는 검토 화면이 건마다
    불러도 UPDATE 는 한 번이다.
    """
    method = _METHOD_BY_SOURCE.get(source)
    if method is None:
        return

    row = get_preferences(session, user)
    if row.last_record_method == method:
        return

    row.last_record_method = method
    session.commit()
