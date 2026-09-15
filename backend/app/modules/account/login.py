"""이메일 코드 로그인과 기기 잇기.

비밀번호가 없다. 여섯 자리 코드를 메일로 받아 그 자리에서 적으면 끝이다. 앱은 익명키로
이미 사람을 구분하고 있으므로, 여기서 하는 일은 **그 익명키를 어느 사람에게 붙일지** 정하는
것뿐이다. 새 사람이면 이 계정에 이메일을 붙이고, 이미 있는 사람이면 이 기기를 그 사람에게
잇는다. 이 기기에 기록이 있었으면 그 기록도 함께 옮긴다.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.core.config import Settings
from app.integrations.email.port import EmailMessage, EmailSender
from app.models import (
    AssetSnapshot,
    Budget,
    Category,
    CategoryBudget,
    Goal,
    GoalStatus,
    ImportBatch,
    ImportCandidate,
    LoginCode,
    MerchantRule,
    NotificationSetting,
    ParseUsage,
    Transaction,
    User,
    UserDevice,
    UserPreference,
)
from app.modules.account.schemas import EmailVerifyOut, MeOut

__all__ = ["me_view", "peek_code", "start_email_login", "update_profile", "verify_email_login"]

logger = logging.getLogger(__name__)

_UNAVAILABLE = "지금은 이메일 연결을 쓸 수 없어요. 잠시 뒤에 다시 해 주세요."
_TOO_MANY = "코드를 너무 자주 보냈어요. 잠시 뒤에 다시 받아 주세요."
_INVALID = "코드가 맞지 않아요. 메일을 다시 확인해 주세요."
_EXPIRED = "코드가 만료됐어요. 새 코드를 받아 주세요."


def _now() -> datetime:
    return datetime.now(UTC)


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def me_view(user: User, settings: Settings) -> MeOut:
    return MeOut(
        email=user.email,
        age_band=user.age_band,
        gender=user.gender,
        profile_asked=user.profile_asked_at is not None,
        email_login_available=settings.email_login_available,
    )


# ── 코드 보내기 ────────────────────────────────────────


def start_email_login(
    session: Session, settings: Settings, sender: EmailSender, email: str
) -> None:
    """여섯 자리 코드를 만들어 보낸다. 앞선 코드는 그 자리에서 죽인다.

    보낼 수단이 없으면 503 이다. 코드를 만들어 두고 못 보내면 사람이 메일함만 보고 있게 된다.
    """
    if not settings.email_login_available:
        raise ApiError(ErrorCode.EMAIL_LOGIN_UNAVAILABLE, _UNAVAILABLE, status_code=503)

    email = normalize_email(email)
    now = _now()
    since = now - timedelta(minutes=settings.login_code_send_window_minutes)
    recent = session.scalar(
        select(func.count())
        .select_from(LoginCode)
        .where(LoginCode.email == email, LoginCode.created_at >= since)
    )
    if (recent or 0) >= settings.login_code_send_limit:
        raise ApiError(ErrorCode.USAGE_LIMIT, _TOO_MANY, status_code=429)

    # 앞선 코드가 살아 있으면 둘 중 아무거나 통하는 자리가 된다. 새 코드 하나만 남긴다.
    session.execute(
        update(LoginCode)
        .where(LoginCode.email == email, LoginCode.consumed_at.is_(None))
        .values(consumed_at=now)
    )

    code = f"{secrets.randbelow(1_000_000):06d}"
    session.add(
        LoginCode(
            email=email,
            code_hash=_hash(code),
            expires_at=now + timedelta(minutes=settings.login_code_ttl_minutes),
        )
    )
    session.commit()

    sender.send(
        EmailMessage(
            to=email,
            subject=f"[10초 가계부] 확인 코드 {code}",
            body=(
                f"확인 코드는 {code} 예요.\n\n"
                f"{settings.login_code_ttl_minutes}분 안에 앱에 적어 주세요. "
                "직접 요청한 것이 아니면 이 메일은 그냥 두셔도 돼요."
            ),
        )
    )


def peek_code(sender: EmailSender, email: str) -> str | None:
    """로컬 스텁이 마지막으로 보낸 코드. 스텁이 아니면 None."""
    sent = getattr(sender, "sent", None)
    if not sent:
        return None
    email = normalize_email(email)
    for message in reversed(sent):
        if message.to == email:
            return str(message.subject).rsplit(" ", 1)[-1]
    return None


# ── 코드 확인과 기기 잇기 ─────────────────────────────


def verify_email_login(
    session: Session,
    settings: Settings,
    current: User,
    current_anon_key_hash: str,
    email: str,
    code: str,
) -> EmailVerifyOut:
    """코드를 확인하고 이 기기를 그 이메일의 사람에게 붙인다.

    틀린 코드는 횟수를 세고, 상한을 넘으면 그 코드는 죽는다. 만료와 틀림은 조언이 달라
    오류 코드를 가른다.
    """
    email = normalize_email(email)
    now = _now()
    row = session.scalar(
        select(LoginCode)
        .where(LoginCode.email == email, LoginCode.consumed_at.is_(None))
        .order_by(LoginCode.created_at.desc())
        .limit(1)
    )
    if row is None:
        raise ApiError(ErrorCode.LOGIN_CODE_INVALID, _INVALID, status_code=422)
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if expires < now:
        raise ApiError(ErrorCode.LOGIN_CODE_EXPIRED, _EXPIRED, status_code=422)
    if not hmac.compare_digest(row.code_hash, _hash(code)):
        row.attempts += 1
        if row.attempts >= settings.login_code_max_attempts:
            row.consumed_at = now
        session.commit()
        raise ApiError(ErrorCode.LOGIN_CODE_INVALID, _INVALID, status_code=422)

    row.consumed_at = now

    owner = session.scalar(
        select(User).where(User.email == email, User.deleted_at.is_(None), User.id != current.id)
    )
    if owner is None:
        # 처음 연결하는 사람이다. 이 계정이 곧 그 사람이 된다.
        current.email = email
        current.email_verified_at = now
        session.commit()
        session.refresh(current)
        return EmailVerifyOut(result="linked", me=me_view(current, settings))

    # 이미 그 이메일의 사람이 있다. 이 기기를 그 사람에게 잇는다.
    had_data = _has_data(session, current)
    if had_data:
        _absorb(session, source=current, target=owner)
    _attach_device(session, current, owner, current_anon_key_hash, now)
    session.commit()
    session.refresh(owner)
    return EmailVerifyOut(result="merged" if had_data else "switched", me=me_view(owner, settings))


def _has_data(session: Session, user: User) -> bool:
    for model in (Transaction, Budget, Goal, AssetSnapshot):
        if session.scalar(select(model.id).where(model.user_id == user.id).limit(1)) is not None:
            return True
    return False


def _attach_device(
    session: Session, source: User, target: User, anon_key_hash: str, now: datetime
) -> None:
    """이 기기(와 이 계정에 딸린 다른 기기)를 target 으로 돌리고 source 는 접는다."""
    session.execute(
        update(UserDevice).where(UserDevice.user_id == source.id).values(user_id=target.id)
    )
    # source 를 처음 만든 기기는 UserDevice 줄이 없다. 신원이 users.anon_key_hash 하나뿐이라,
    # 그 줄을 안 만들어 두면 그 기기가 다음에 열 때 접힌 계정에 떨어져 빈 가계부를 본다.
    for key in {anon_key_hash, source.anon_key_hash}:
        session.execute(delete(UserDevice).where(UserDevice.anon_key_hash == key))
        session.add(UserDevice(anon_key_hash=key, user_id=target.id))
    # 접은 계정은 조회에 안 걸린다. 이메일은 target 것이라 여기서 비운다.
    source.email = None
    source.deleted_at = now


def _absorb(session: Session, *, source: User, target: User) -> None:
    """source 의 기록을 target 으로 옮긴다. 겹치는 것은 target 것을 남긴다.

    지우는 쪽이 아니라 **남기는 쪽**을 고르는 자리다. 같은 달 예산·같은 이름 분류·같은 상호
    규칙처럼 하나만 있어야 하는 것은 target(이미 그 이메일로 쓰던 사람) 것을 지킨다.
    """
    # 분류. 같은 이름이 target 에 있으면 source 것을 그쪽으로 접고, 없으면 주인만 바꾼다.
    target_names = {
        row.name: row.id
        for row in session.scalars(select(Category).where(Category.user_id == target.id))
    }
    for cat in session.scalars(select(Category).where(Category.user_id == source.id)).all():
        keep = target_names.get(cat.name)
        if keep is None:
            cat.user_id = target.id
            target_names[cat.name] = cat.id
            continue
        session.execute(
            update(Transaction).where(Transaction.category_id == cat.id).values(category_id=keep)
        )
        session.execute(
            update(ImportCandidate)
            .where(ImportCandidate.category_id == cat.id)
            .values(category_id=keep)
        )
        session.execute(
            update(MerchantRule).where(MerchantRule.category_id == cat.id).values(category_id=keep)
        )
        session.execute(delete(CategoryBudget).where(CategoryBudget.category_id == cat.id))
        session.delete(cat)
    session.flush()

    # 상호 규칙. 같은 상호는 target 것을 남긴다.
    target_merchants = set(
        session.scalars(
            select(MerchantRule.merchant_normalized).where(MerchantRule.user_id == target.id)
        )
    )
    for rule in session.scalars(select(MerchantRule).where(MerchantRule.user_id == source.id)):
        if rule.merchant_normalized in target_merchants:
            # 접기만 한다. 옮기면 (user_id, merchant_normalized) 자리가 겹쳐 터진다.
            rule.deleted_at = _now()
        else:
            rule.user_id = target.id
    session.flush()

    # 예산. 같은 달은 target 것을 남긴다.
    target_periods = set(
        session.scalars(select(Budget.period_start).where(Budget.user_id == target.id))
    )
    for budget in session.scalars(select(Budget).where(Budget.user_id == source.id)):
        if budget.period_start in target_periods:
            # **지우지 않고 접는다.** 겹치는 달은 target 것을 쓰지만, 이쪽이 정해 둔 금액과
            # 카테고리 한도가 통째로 사라지면 합치기 한 번에 몇 달치가 없던 일이 된다.
            # 옮기지도 않는다. 같은 달 자리를 둘이 잡으면 unique 가 막는다.
            now = _now()
            session.execute(
                update(CategoryBudget)
                .where(CategoryBudget.budget_id == budget.id, CategoryBudget.deleted_at.is_(None))
                .values(deleted_at=now)
            )
            budget.deleted_at = now
        else:
            budget.user_id = target.id
    session.flush()

    # 목표. 진행 중인 것은 하나뿐이라 target 에 있으면 source 것은 접는다.
    target_active = session.scalar(
        select(Goal.id).where(
            Goal.user_id == target.id, Goal.status == GoalStatus.ACTIVE, Goal.deleted_at.is_(None)
        )
    )
    for goal in session.scalars(select(Goal).where(Goal.user_id == source.id)):
        if (
            target_active is not None
            and goal.status == GoalStatus.ACTIVE
            and goal.deleted_at is None
        ):
            # 지난 목표로 접는다. **deleted_at 은 찍지 않는다.** 찍으면 「지난 목표」
            # 화면에서도 안 보여, 몇 달을 모은 것이 통째로 없던 일이 된다.
            goal.status = GoalStatus.ARCHIVED
        goal.user_id = target.id
    session.flush()

    for model in (Transaction, AssetSnapshot, ImportBatch, ParseUsage):
        session.execute(update(model).where(model.user_id == source.id).values(user_id=target.id))
    # 설정과 알림은 target 것을 쓴다. source 것은 익명키 원문이 들어 있어 남기지 않는다.
    session.execute(delete(NotificationSetting).where(NotificationSetting.user_id == source.id))
    session.execute(delete(UserPreference).where(UserPreference.user_id == source.id))
    session.flush()


# ── 연령대·성별 ────────────────────────────────────────


def update_profile(
    session: Session,
    settings: Settings,
    user: User,
    *,
    age_band: object,
    gender: object,
    fields_set: set[str],
) -> MeOut:
    """보낸 필드만 고친다. 아무것도 안 보내도 「물었다」 는 표시는 남는다(건너뛰기)."""
    if "age_band" in fields_set:
        user.age_band = age_band  # type: ignore[assignment]
    if "gender" in fields_set:
        user.gender = gender  # type: ignore[assignment]
    user.profile_asked_at = _now()
    session.commit()
    session.refresh(user)
    return me_view(user, settings)
