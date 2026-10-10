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
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, delete, func, or_, select, text, update
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.core.config import Settings
from app.domain.period import BudgetPeriod
from app.integrations.email.port import EmailMessage, EmailSender
from app.models import (
    AssetEntry,
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
from app.modules import ledger
from app.modules.account.schemas import EmailVerifyOut, MeOut
from app.modules.assets.merge import absorb_assets
from app.modules.books import service as books
from app.modules.budgets import service as budgets

__all__ = [
    "live_code_query",
    "me_view",
    "peek_code",
    "start_email_login",
    "update_profile",
    "verify_email_login",
]

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
        shared_books_enabled=settings.shared_books_enabled,
    )


# ── 코드 보내기 ────────────────────────────────────────


def start_email_login(
    session: Session, settings: Settings, sender: EmailSender, email: str, requested_by: User
) -> None:
    """여섯 자리 코드를 만들어 보낸다. 앞선 코드는 그 자리에서 죽인다.

    보낼 수단이 없으면 503 이다. 코드를 만들어 두고 못 보내면 사람이 메일함만 보고 있게 된다.
    상한은 받는 주소마다, 보내 달라는 사람마다 둘 다 본다. 어느 쪽에 걸려도 같은 429 다.
    """
    if not settings.email_login_available:
        raise ApiError(ErrorCode.EMAIL_LOGIN_UNAVAILABLE, _UNAVAILABLE, status_code=503)

    email = normalize_email(email)
    _lock_requester(session, requested_by)
    now = _now()
    since = now - timedelta(minutes=settings.login_code_send_window_minutes)
    recent = session.scalar(
        select(func.count())
        .select_from(LoginCode)
        .where(LoginCode.email == email, LoginCode.created_at >= since)
    )
    if (recent or 0) >= settings.login_code_send_limit:
        raise ApiError(ErrorCode.USAGE_LIMIT, _TOO_MANY, status_code=429)
    # 하루 틀린 횟수를 다 쓴 주소는 코드를 받아도 못 쓴다. 메일만 쌓이지 않게 여기서 멈춘다.
    if _over_fail_limit(session, settings, email, requested_by, now):
        raise ApiError(ErrorCode.USAGE_LIMIT, _TOO_MANY, status_code=429)
    if _over_requester_limit(session, settings, requested_by, email, now):
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
            requested_by_user_id=requested_by.id,
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


def _lock_requester(session: Session, user: User) -> None:
    """같은 사람의 코드 요청을 줄 세운다. 세고 넣는 사이에 다른 요청이 끼면 상한을 넘는다.

    트랜잭션 잠금이라 아래 commit 이나 오류 뒤 롤백에서 풀린다. 세션 연결 하나만 쓴다.
    """
    if session.get_bind().dialect.name != "postgresql":
        return
    session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"login-start:{user.id}"},
    )


def _over_requester_limit(
    session: Session, settings: Settings, user: User, email: str, now: datetime
) -> bool:
    """한 사람이 하루에 보낸 메일 수와 서로 다른 받는 주소 수가 상한에 닿았나."""
    rows = session.execute(
        select(LoginCode.email).where(
            LoginCode.requested_by_user_id == user.id,
            LoginCode.created_at >= now - timedelta(hours=24),
        )
    ).scalars()
    sent = list(rows)
    if len(sent) >= settings.login_code_user_daily_send_limit:
        return True
    # 이미 보낸 주소로 다시 받는 것은 새 주소가 아니다. 다시 보내기는 주소 상한을 안 먹는다.
    addresses = set(sent)
    return email not in addresses and len(addresses) >= settings.login_code_user_daily_email_limit


def _over_fail_limit(
    session: Session, settings: Settings, email: str, user: User, now: datetime
) -> bool:
    """지난 24시간 틀린 횟수가 상한에 닿았나. 코드를 새로 받아도 앞선 코드 몫까지 센다.

    상한은 (주소, 요청한 사람)마다 둔다. 주소 하나로만 세면 남이 그 주소로 일부러 틀려
    주인의 로그인을 하루 동안 막을 수 있다. 주소 전체 상한은 훨씬 높게 두는 마지막 문이다.
    """
    since = now - timedelta(hours=24)
    base = select(func.coalesce(func.sum(LoginCode.attempts), 0)).where(
        LoginCode.email == email, LoginCode.created_at >= since
    )
    mine = session.scalar(base.where(LoginCode.requested_by_user_id == user.id))
    if int(mine or 0) >= settings.login_code_daily_fail_limit:
        return True
    total = session.scalar(base)
    return int(total or 0) >= settings.login_code_email_daily_fail_limit


def live_code_query(email: str, requester_id: uuid.UUID) -> Select[tuple[LoginCode]]:
    """그 주소로 이 사람이 받은 살아 있는 코드를 잠가 읽는다.

    코드는 받아 간 사람만 쓸 수 있다. 화면은 코드를 받은 그 시트에서만 코드를 적으므로
    정상 흐름은 늘 같은 사람이다. 요청한 사람이 비어 있는 줄은 이 칸이 생기기 전 코드라
    누구나 쓴다(10분이면 사라진다).
    잠그지 않으면 동시에 보낸 확인 요청이 모두 같은 틀린 횟수를 보고 지나가, 코드마다
    5번 상한이 지켜지지 않는다. 잠근 뒤에는 앞선 요청이 남긴 값을 다시 읽는다.
    """
    return (
        select(LoginCode)
        .where(
            LoginCode.email == email,
            LoginCode.consumed_at.is_(None),
            or_(
                LoginCode.requested_by_user_id == requester_id,
                LoginCode.requested_by_user_id.is_(None),
            ),
        )
        .order_by(LoginCode.created_at.desc())
        .limit(1)
        .with_for_update()
        .execution_options(populate_existing=True)
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
    row = session.scalar(live_code_query(email, current.id))
    if row is None:
        raise ApiError(ErrorCode.LOGIN_CODE_INVALID, _INVALID, status_code=422)
    # 하루 틀린 횟수를 다 쓴 주소는 맞는 코드도 보지 않는다. 새 코드를 받아 가며
    # 하루 수천 번 맞혀 보는 길을 여기서 닫는다.
    if _over_fail_limit(session, settings, email, current, now):
        raise ApiError(ErrorCode.USAGE_LIMIT, _UNAVAILABLE, status_code=429)
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if expires < now:
        raise ApiError(ErrorCode.LOGIN_CODE_EXPIRED, _EXPIRED, status_code=422)
    if not hmac.compare_digest(row.code_hash, _hash(code)):
        # 읽은 값에 더하지 않고 DB 의 값에 더한다. 잠금이 없는 DB 에서도 횟수가 덮이지 않는다.
        row.attempts = LoginCode.attempts + 1
        session.flush()
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
    # 공유 가계부 멤버십은 기록이 없어도 옮긴다. 초대받아 공유 가계부에만 적은 사람도 있다.
    books.absorb_memberships(session, source=current, target=owner)
    _attach_device(session, current, owner, current_anon_key_hash, now)
    session.commit()
    session.refresh(owner)
    return EmailVerifyOut(result="merged" if had_data else "switched", me=me_view(owner, settings))


def _has_data(session: Session, user: User) -> bool:
    for model in (Transaction, Budget, Goal, AssetSnapshot, AssetEntry):
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

    # 예산. 두 쪽 한 달 시작일이 다를 수 있어 이름 달(10월)로 견주고, source 줄은 target 의
    # 시작일 기간으로 옮긴다. 옛 기간 그대로 두면 아무도 안 보는 자리에 앉았다가, 나중에
    # 시작일을 바꿀 때 target 의 같은 달 줄과 한데 묶인다. 같은 이름 달은 target 것을 남긴다.
    target_rows = list(session.scalars(select(Budget).where(Budget.user_id == target.id)))
    taken = {BudgetPeriod(row.period_start, row.period_end).key for row in target_rows}
    seated = {row.period_start for row in target_rows}
    source_rows = sorted(
        session.scalars(select(Budget).where(Budget.user_id == source.id)),
        key=budgets.keep_order,
        reverse=True,
    )
    for budget in source_rows:
        key = BudgetPeriod(budget.period_start, budget.period_end).key
        year, month = (int(part) for part in key.split("-"))
        period = ledger.period_of_month(target, year, month)
        if key in taken or period.start in seated:
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
            budget.period_start, budget.period_end = period.start, period.end
            taken.add(key)
            seated.add(period.start)
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

    # 자산은 스냅샷과 장부를 옮기고, 두 쪽 최신 목록을 오늘 스냅샷 하나로 묶는다.
    absorb_assets(session, source=source, target=target)
    for model in (Transaction, ImportBatch, ParseUsage):
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
