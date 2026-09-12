"""줄글·캡처·영수증 입력의 분석·검토·저장.

분석은 거래를 만들지 않는다. 검토 단위(ImportBatch)와 후보만 만든다.
저장은 commit 이 따로 하고, 그때 만들어지는 거래는 키패드로 적은 것과 같은 길을 지난다.

확신이 낮은 후보를 조용히 확정하지 않는다. 그런 후보는 서버가 선택을 꺼서 내려보낸다.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from functools import partial
from typing import NamedTuple

import anyio.from_thread
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError, ErrorCode
from app.core.config import get_settings
from app.domain.extraction_review import ReviewVerdict, review_extraction
from app.domain.fingerprint import Fingerprint, build_fingerprint, normalize_merchant
from app.domain.money import Money
from app.domain.redaction import redact
from app.integrations.imaging import prepare_image
from app.integrations.llm import (
    LOW_CONFIDENCE_THRESHOLD,
    LlmError,
    LlmImage,
    LlmStructuredClient,
    TransactionCandidate,
    TransactionExtraction,
    TransactionSource,
    TransactionType,
    attach_source,
    natural_language_prompt,
    receipt_prompt,
    retry_prompt,
    screenshot_prompt,
)
from app.models import (
    Category,
    CategoryKind,
    ImportBatch,
    ImportBatchStatus,
    ImportCandidate,
    MerchantRule,
    ParseUsage,
    Transaction,
    User,
)
from app.modules import ledger
from app.modules.categories import service as categories
from app.modules.transactions import service as transactions

logger = logging.getLogger(__name__)

__all__ = [
    "CommitResult",
    "commit_batch",
    "delete_batch",
    "get_batch",
    "parse_image",
    "parse_text",
    "update_candidate",
]

# 검토 화면에 한 번에 올리는 상한. 그 이상은 사람이 훑어보지 못한다.
MAX_CANDIDATES = 20


class _ImageKind(NamedTuple):
    """이미지 한 장을 읽는 입구가 서로 다르게 가진 것."""

    prompt: Callable[[date, list[str]], str]
    """모델에게 무엇을 읽는지 알려 주는 지시. 날짜와 고를 수 있는 분류 이름을 받는다."""
    subject: str
    """못 읽었을 때 사용자에게 말하는 말. '지금은 OO 읽지 못했어요' 자리에 들어간다."""
    quota_label: str
    """하루 상한에 걸렸을 때 무엇을 다 썼는지 말하는 말."""


# 프롬프트·문구·출처를 한 줄에 묶어 둔다. 따로 두면 영수증을 캡처 프롬프트로 읽고도
# 화면에는 영수증이라 적히는 어긋남이 조용히 생긴다.
_IMAGE_KINDS: dict[TransactionSource, _ImageKind] = {
    TransactionSource.SCREENSHOT: _ImageKind(screenshot_prompt, "캡처를", "캡처 분석"),
    TransactionSource.RECEIPT: _ImageKind(receipt_prompt, "영수증을", "영수증 분석"),
}

# 후보의 종류와 짝이 맞는 분류 종류. 환불은 되돌릴 지출의 분류를 따라가므로 짝이 없다.
_KIND_FOR_TYPE: dict[TransactionType, CategoryKind] = {
    TransactionType.EXPENSE: CategoryKind.EXPENSE,
    TransactionType.INCOME: CategoryKind.INCOME,
    TransactionType.TRANSFER: CategoryKind.TRANSFER,
}


class _LearnedRule(NamedTuple):
    """기억한 규칙 하나. 분류의 종류를 함께 들고 다닌다.

    종류를 모르면 지출로 기억한 규칙이 '+' 를 붙여 수입이 된 후보에도 붙는다.
    """

    category_id: uuid.UUID
    kind: CategoryKind


class CommitResult:
    """저장 결과. 마지막 한 건의 판정과, 예산을 말할 기준 한 건을 함께 들고 다닌다.

    합계는 지출만 센다. 검토 화면의 저장 버튼과 같은 규칙이라야 두 화면이 같은 숫자를 말한다.
    """

    __slots__ = ("batch", "budget_outcome", "created_count", "expense_total", "outcome")

    def __init__(
        self,
        *,
        batch: ImportBatch,
        created_count: int,
        expense_total: Decimal,
        outcome: transactions.SaveOutcome | None,
        budget_outcome: transactions.SaveOutcome | None,
    ) -> None:
        self.batch = batch
        self.created_count = created_count
        self.expense_total = expense_total
        self.outcome = outcome
        # 예산은 마지막 한 건이 아니라 저장한 것들 중 오늘이 속한 기간을 고른다.
        self.budget_outcome = budget_outcome


def parse_text(
    session: Session,
    user: User,
    *,
    text: str,
    client: LlmStructuredClient,
    escalation: LlmStructuredClient | None = None,
    today: date | None = None,
) -> ImportBatch:
    """줄글에서 거래 후보를 뽑아 검토 단위를 만든다."""
    day = today or ledger.today_for(user)
    _require_quota(session, user, day, label="줄글 분석")

    # 저장하지 않는 것만으로는 부족하다. 보내기 전에 가린다.
    cleaned = redact(text)
    read = _read_twice_if_odd(
        client,
        escalation,
        prompt=natural_language_prompt(day, _category_names(session, user)),
        today=day,
        subject="문장을",
        text=cleaned.text,
    )
    return _build_batch(
        session,
        user,
        source=TransactionSource.NL,
        read=read,
        day=day,
        client=client,
        input_length=len(text),
        redacted_count=cleaned.count,
    )


def parse_image(
    session: Session,
    user: User,
    *,
    image: LlmImage,
    source: TransactionSource,
    client: LlmStructuredClient,
    escalation: LlmStructuredClient | None = None,
    today: date | None = None,
) -> ImportBatch:
    """이미지 한 장에서 거래 후보를 뽑아 검토 단위를 만든다.

    캡처와 영수증이 이 함수를 나눠 쓴다. 갈리는 것은 프롬프트와 문구뿐이고
    자르기·중복 판정·상호 학습·저장은 그 아래로 같은 길이다.

    이미지는 어디에도 저장하지 않는다. 요청이 끝나면 파이썬 객체와 함께 사라진다.
    """
    kind = _IMAGE_KINDS[source]
    day = today or ledger.today_for(user)
    _require_quota(session, user, day, label=kind.quota_label)

    # 돌리고 · 여백을 잘라내고 · 줄인 뒤에 보낸다. 위치 정보도 여기서 끊긴다.
    sent = prepare_image(image)
    read = _read_twice_if_odd(
        client,
        escalation,
        prompt=kind.prompt(day, _category_names(session, user)),
        today=day,
        subject=kind.subject,
        image=sent,
    )
    return _build_batch(
        session,
        user,
        source=source,
        read=read,
        day=day,
        client=client,
        # 이미지에서는 글자 수가 없다. 실제로 보낸 바이트 수를 센다.
        input_length=len(sent.data),
        # redact() 는 문자열만 가린다. 이미지 안의 카드번호는 가릴 수단이 없고,
        # 0 이 그 사실을 표에 남긴 것이다.
        redacted_count=0,
    )


def _build_batch(
    session: Session,
    user: User,
    *,
    source: TransactionSource,
    read: _ReadResult,
    day: date,
    client: LlmStructuredClient,
    input_length: int,
    redacted_count: int,
) -> ImportBatch:
    """추출 결과를 검토 단위로 옮긴다. 줄글·캡처·영수증이 이 뒤로는 같은 길을 지난다."""
    found = attach_source(read.extraction, source)
    candidates = found[:MAX_CANDIDATES]
    dropped = len(found) - len(candidates)

    batch = ImportBatch(
        user_id=user.id,
        source=source,
        status=ImportBatchStatus.READY,
        detected_count=len(candidates),
        # 상한을 넘겨 버린 건수를 남긴다. 조용히 사라지면 사용자가 몇 건을 잃었는지 모른다.
        error_code=f"TRUNCATED:{dropped}" if dropped else None,
    )
    session.add(batch)
    session.flush()

    known = _known_fingerprints(session, user)
    rules = _rules_by_merchant(session, user)
    for order, candidate in enumerate(candidates):
        session.add(
            _to_row(
                session,
                user,
                batch,
                candidate,
                order,
                day,
                known,
                rules,
                # 두 모델을 다 거치고도 이상한 줄은 사람이 봐야 한다.
                needs_eyes=read.verdict.flags(order),
            )
        )

    session.commit()
    session.refresh(batch)

    _record_usage(
        session,
        user,
        client=client,
        source=source,
        input_length=input_length,
        redacted_count=redacted_count,
        candidate_count=len(candidates),
        model=read.model,
        escalated=read.escalated,
    )
    return batch


def get_batch(session: Session, user: User, batch_id: uuid.UUID) -> ImportBatch:
    batch = session.get(ImportBatch, batch_id)
    if batch is None or batch.user_id != user.id:
        raise ApiError(ErrorCode.NOT_FOUND, "분석 결과를 찾지 못했어요.", status_code=404)
    return batch


def update_candidate(
    session: Session,
    user: User,
    batch_id: uuid.UUID,
    candidate_id: uuid.UUID,
    data: dict[str, object],
) -> ImportBatch:
    """후보 한 줄을 고친다. 보낸 항목만 바뀐다."""
    batch = _require_open(session, user, batch_id)
    row = next((item for item in batch.candidates if item.id == candidate_id), None)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, "고칠 항목을 찾지 못했어요.", status_code=404)

    if "category_id" in data:
        categories.require_owned(session, user, data["category_id"])  # type: ignore[arg-type]

    # 재판정에 쓸 고치기 전 상태. setattr 로 값이 바뀌기 전에 떠 둔다.
    was_duplicate = row.is_duplicate
    was_refund = row.type == TransactionType.REFUND
    # 서버가 스스로 꺼 둔 줄인지. 셋 중 아무 이유도 없이 꺼져 있으면 사람이 손으로 끈 것이다.
    was_blocked = was_duplicate or was_refund or row.confidence < LOW_CONFIDENCE_THRESHOLD

    for field, value in data.items():
        if field == "occurred_at" and isinstance(value, datetime):
            value = value.astimezone(UTC)
        setattr(row, field, value)

    if "merchant" in data:
        row.merchant_normalized = normalize_merchant(row.merchant) or None

    if _touches_content(data):
        # 사람이 직접 본 값이다. 점선 표시를 남겨 두면 고쳐도 계속 의심스러워 보인다.
        row.confidence = 1.0
        # 이 제품의 북극성이 '손 안 대고 저장된 비율' 이다. 지금 남기지 않으면
        # 나중에 어떤 방법으로도 되살릴 수 없다. 무엇을 고쳤는지는 담지 않는다.
        # 선택만 껐다 켠 것은 고친 것이 아니라 `_touches_content` 가 걸러 낸다.
        row.was_edited = True
        fingerprint = _fingerprint_of(row, user)
        row.fingerprint = fingerprint.value
        row.is_duplicate = fingerprint.duplicate_eligible and fingerprint.value in (
            _known_fingerprints(session, user)
        )
        if "is_selected" not in data:
            now_refund = row.type == TransactionType.REFUND
            now_blocked = row.is_duplicate or now_refund
            if now_blocked and not (was_duplicate or was_refund):
                # 고쳐서 이제야 이미 있는 것과 같아졌거나 환불이 된 줄만 끈다.
                # 안 끄면 켜진 채 남아 같은 거래가 두 번 저장된다.
                row.is_selected = False
            elif not now_blocked and was_blocked:
                # 꺼 둘 이유가 사라졌으니 되켠다.
                # 사람이 손으로 끈 줄은 애초에 이유가 없어 여기 안 걸리고 꺼진 채 남는다.
                row.is_selected = True

    session.commit()
    session.refresh(batch)
    return batch


def commit_batch(
    session: Session,
    user: User,
    batch_id: uuid.UUID,
    *,
    today: date | None = None,
) -> CommitResult:
    """고른 후보를 실제 거래로 저장한다."""
    batch = _require_open(session, user, batch_id)
    day = today or ledger.today_for(user)
    chosen = [row for row in batch.candidates if row.is_selected]
    if not chosen:
        raise ApiError(
            ErrorCode.INVALID_REQUEST, "저장할 항목을 하나 이상 골라 주세요.", status_code=422
        )

    for row in chosen:
        if row.type == TransactionType.REFUND:
            raise ApiError(
                ErrorCode.INVALID_REFUND_TARGET,
                "환불은 내역에서 원래 지출을 찾아 되돌려 주세요.",
                status_code=422,
            )
        categories.require_owned(session, user, row.category_id)

    total = Decimal(0)
    outcome: transactions.SaveOutcome | None = None
    outcomes: list[transactions.SaveOutcome] = []
    for row in chosen:
        spent = row.amount if row.type == TransactionType.EXPENSE else Decimal(0)
        if row.transaction_id is not None:
            # 앞선 시도에서 이미 저장한 건이다. 다시 저장하면 두 번 들어간다.
            total += spent
            continue
        tx, outcome = transactions.create_transaction(
            session,
            user,
            {
                "occurred_at": ledger.as_utc(row.occurred_at),
                "amount": row.amount,
                "type": row.type,
                "merchant": row.merchant,
                "category_id": row.category_id,
                "source": batch.source,
                "confidence": row.confidence,
                "excluded_from_budget": False,
                "payment_method": row.payment_method,
                # 원본은 안 남으므로 이 거래가 어느 분석에서 나왔는지는 이 값이 유일한 실마리다.
                "import_batch_id": batch.id,
            },
            today=day,
        )
        outcomes.append(outcome)
        row.transaction_id = tx.id
        total += spent
        _learn_rule(session, user, row)

    batch.status = ImportBatchStatus.COMMITTED
    batch.committed_count = len(chosen)
    batch.error_code = None
    batch.completed_at = datetime.now(UTC)
    session.commit()
    session.refresh(batch)
    return CommitResult(
        batch=batch,
        created_count=len(chosen),
        expense_total=total,
        outcome=outcome,
        budget_outcome=_budget_outcome(outcomes, ledger.period_for(user, day)),
    )


def _budget_outcome(
    outcomes: list[transactions.SaveOutcome], current: ledger.BudgetPeriod
) -> transactions.SaveOutcome | None:
    """저장한 것들 중 어느 기간의 예산을 말할지 고른다.

    묶음은 여러 달에 걸칠 수 있다. 마지막 저장 건에 맡기면 정렬 순서가 곧 답이 되어,
    캡처처럼 그저께 건이 마지막인 묶음은 달이 바뀐 직후 지난달 예산을 말한다.
    지금 달이 섞여 있으면 그것을, 아니면 가장 늦은 기간을 고른다.
    """
    if not outcomes:
        return None
    # 뒤에서부터 찾는다. 판정은 저장한 그 시점의 스냅샷이라 앞엣것은 뒤에 저장한 건이 빠져 있다.
    for item in reversed(outcomes):
        if item.period == current:
            return item
    # reversed 를 지나게 한다. 같은 기간이 여럿이면 max 가 앞엣것을 고르는데,
    # 앞 스냅샷에는 뒤에 저장한 건이 빠져 있어 남은 예산이 그만큼 많아 보인다.
    return max(reversed(outcomes), key=lambda item: item.period.start)


def delete_batch(session: Session, user: User, batch_id: uuid.UUID) -> None:
    """검토를 접는다. 후보는 함께 사라지고 저장한 거래는 남는다."""
    batch = session.get(ImportBatch, batch_id)
    if batch is None or batch.user_id != user.id:
        return
    session.delete(batch)
    session.commit()


def _require_open(session: Session, user: User, batch_id: uuid.UUID) -> ImportBatch:
    batch = get_batch(session, user, batch_id)
    if batch.status == ImportBatchStatus.COMMITTED:
        raise ApiError(ErrorCode.CONFLICT, "이미 저장한 분석 결과예요.", status_code=409)
    return batch


def _touches_content(data: dict[str, object]) -> bool:
    return any(field != "is_selected" for field in data)


class _ReadResult(NamedTuple):
    """읽어 낸 결과와 서버가 본 판정."""

    extraction: TransactionExtraction
    verdict: ReviewVerdict
    #: 두 번째 모델까지 불렀나. 값이 비싸 얼마나 자주 가는지 세어야 한다.
    escalated: bool
    #: 이 결과를 실제로 낸 모델.
    model: str


def _read_twice_if_odd(
    client: LlmStructuredClient,
    escalation: LlmStructuredClient | None,
    *,
    prompt: str,
    today: date,
    subject: str,
    text: str | None = None,
    image: LlmImage | None = None,
) -> _ReadResult:
    """싼 모델로 먼저 읽고, 서버 검증에 걸린 것만 비싼 모델로 다시 읽는다.

    되도록 안 부른다. 1차가 깨끗하면 두 번째 모델은 아예 안 뜬다.
    다시 읽어도 이상하면 **더 이상 안 부르고 사람에게 넘긴다.** 세 번째 모델은 없다.

    재시도 자체가 실패하면(키·한도·타임아웃) 1차 결과를 그대로 쓴다. 첫 답이 있는데
    두 번째 호출이 죽었다고 사용자에게 아무것도 못 준다고 하는 것은 과하다.
    """
    first = _extract(client, prompt=prompt, today=today, subject=subject, text=text, image=image)
    verdict = review_extraction(first, today=today)
    if verdict.is_clean or escalation is None:
        if not verdict.is_clean:
            logger.info("재시도 모델이 없어 사람에게 넘긴다: %s", verdict.summary())
        return _ReadResult(extraction=first, verdict=verdict, escalated=False, model=client.model)

    logger.info("1차가 이상해 다시 읽는다 model=%s: %s", escalation.model, verdict.summary())
    try:
        second = _extract(
            escalation,
            prompt=retry_prompt(prompt, verdict.summary()),
            today=today,
            subject=subject,
            text=text,
            image=image,
        )
    except ApiError:
        logger.warning("재시도가 실패해 1차 결과를 그대로 쓴다")
        return _ReadResult(extraction=first, verdict=verdict, escalated=True, model=client.model)

    retried = review_extraction(second, today=today)
    if retried.is_clean:
        logger.info("다시 읽으니 깨끗하다 model=%s", escalation.model)
    else:
        logger.info("다시 읽어도 이상해 사람에게 넘긴다: %s", retried.summary())
    return _ReadResult(extraction=second, verdict=retried, escalated=True, model=escalation.model)


def _extract(
    client: LlmStructuredClient,
    *,
    prompt: str,
    today: date,
    subject: str,
    text: str | None = None,
    image: LlmImage | None = None,
) -> TransactionExtraction:
    """비동기 포트를 동기 서비스에서 부른다.

    이 앱의 핸들러는 전부 동기라 FastAPI 가 워커 스레드에서 돌린다.
    `anyio.from_thread.run` 이 그 스레드에서 본래 이벤트 루프로 코루틴을 넘긴다.
    핸들러를 async 로 바꾸면 동기 SQLAlchemy 가 루프를 막는다.

    text 와 image 중 하나만 넣는다. 둘 다거나 둘 다 아니면 포트가 막는다.
    subject 는 실패했을 때 사용자에게 무엇을 못 읽었는지 말하는 말이다. 사진을 넣었는데
    '문장을 읽지 못했다' 고 하면 거짓말이 된다.
    """
    call = partial(
        client.extract,
        prompt=prompt,
        schema=TransactionExtraction,
        text=text,
        image=image,
        today=today,
    )
    try:
        return anyio.from_thread.run(call)
    except LlmError as exc:
        raise ApiError(
            ErrorCode.PARSE_UNAVAILABLE,
            f"지금은 {subject} 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.",
            status_code=503,
        ) from exc


def _to_row(
    session: Session,
    user: User,
    batch: ImportBatch,
    candidate: TransactionCandidate,
    order: int,
    today: date,
    known: set[str],
    rules: dict[str, _LearnedRule],
    needs_eyes: bool = False,
) -> ImportCandidate:
    occurred_at = _occurred_at(candidate.occurred_at, user, today)
    # 돌아온 값도 가린다. 캡처는 입력을 가릴 수단이 없어(이미지다) 여기가 유일한 그물이고,
    # 줄글도 모델이 지어낸 숫자가 섞일 수 있다. 여기서 막지 않으면 거래·기억한 분류에 영구히 남는다.
    merchant = redact(candidate.merchant).text if candidate.merchant else None
    merchant_normalized = normalize_merchant(merchant) or None
    category_id = _category_for(session, user, candidate, merchant_normalized, rules)
    amount = Decimal(candidate.amount)
    fingerprint = build_fingerprint(
        occurred_on=ledger.local_date(occurred_at, ledger.user_tz(user)),
        amount=Money(amount),
        type=candidate.type,
        merchant=merchant,
    )
    is_duplicate = fingerprint.duplicate_eligible and fingerprint.value in known
    low = candidate.confidence < LOW_CONFIDENCE_THRESHOLD
    # 환불은 되돌릴 지출을 골라야 한다. 대상 없이 저장하면 쓴 적 없는 돈이 예산으로 돌아온다.
    needs_target = candidate.type == TransactionType.REFUND
    return ImportCandidate(
        import_batch_id=batch.id,
        occurred_at=occurred_at,
        amount=amount,
        type=candidate.type,
        merchant=merchant,
        merchant_normalized=merchant_normalized,
        category_id=category_id,
        payment_method=candidate.payment_method,
        confidence=candidate.confidence,
        fingerprint=fingerprint.value,
        is_duplicate=is_duplicate,
        # 확신이 낮거나 · 이미 있거나 · 서버 검증에 걸린 것은 스스로 켜지지 않는다.
        # 사람이 켜야 저장된다.
        is_selected=not low and not is_duplicate and not needs_target and not needs_eyes,
        sort_order=order,
    )


def _occurred_at(occurred_on: date | None, user: User, today: date) -> datetime:
    """날짜만 아는 값을 시각으로 옮긴다.

    오늘 것은 지금 시각이고, 지난 날은 그 날 정오다. 자정에 가까운 시각을 골라 두면
    시간대 계산에서 하루가 밀린다.
    """
    tz = ledger.user_tz(user)
    if occurred_on is None or occurred_on == today:
        return datetime.now(UTC)
    return datetime.combine(occurred_on, time(hour=12), tzinfo=tz).astimezone(UTC)


def _category_for(
    session: Session,
    user: User,
    candidate: TransactionCandidate,
    merchant_normalized: str | None,
    rules: dict[str, _LearnedRule],
) -> uuid.UUID | None:
    """분류 우선순위: 내 규칙 → 모델이 고른 이름 → 사용자 확인.

    규칙은 분류의 종류가 후보의 종류와 맞을 때만 붙인다. 같은 상호로 지출과 수입을 둘 다
    적는 일이 있어서(`알바비 12000` 과 `알바비 +150000`), 종류를 안 보면 기억한 지출 분류가
    수입 후보에 붙는다. 환불은 되돌릴 지출의 분류를 따라가므로 어느 규칙도 붙지 않는다.

    공용 상호 사전은 아직 없다. 없는 단계를 있는 척 끼워 넣지 않는다.
    """
    rule = rules.get(merchant_normalized) if merchant_normalized else None
    if rule is not None and rule.kind is _KIND_FOR_TYPE.get(candidate.type):
        return rule.category_id
    if candidate.category is None:
        return None
    return _category_id_by_name(session, user, candidate.category)


def _category_names(session: Session, user: User) -> list[str]:
    """모델에게 보여 줄 분류 이름. **내가 만든 것이 먼저다.**

    기본 목록만 주면 '데이트' 를 만들어 둔 사람이 줄글이나 캡처로 적을 때 그 이름이
    후보에 없어 영영 안 붙는다. 앞에 세우는 이유는 목록이 길면 뒤가 잘리기 때문이다.
    """
    rows = categories.list_categories(session, user)
    mine = [row.name for row in rows if row.user_id is not None]
    shared = [row.name for row in rows if row.user_id is None]
    return mine + shared


def _category_id_by_name(session: Session, user: User, name: str) -> uuid.UUID | None:
    stmt = (
        select(Category.id)
        .where(
            Category.name == name,
            Category.deleted_at.is_(None),
            # IN (id, NULL) 은 NULL 을 못 잡는다. 공용 카테고리가 통째로 빠진다.
            or_(Category.user_id == user.id, Category.user_id.is_(None)),
        )
        # 내가 만든 것이 공용보다 앞선다.
        .order_by(Category.user_id.is_(None))
        .limit(1)
    )
    return session.scalars(stmt).first()


def _rules_by_merchant(session: Session, user: User) -> dict[str, _LearnedRule]:
    # 지운 분류를 가리키는 규칙은 뺀다. 그 id 를 후보에 붙이면 저장이 묶음째 거절된다.
    # 분류의 종류도 같이 읽는다. 붙일 때 후보의 종류와 맞는지 봐야 한다.
    stmt = (
        select(MerchantRule.merchant_normalized, MerchantRule.category_id, Category.kind)
        .join(Category, Category.id == MerchantRule.category_id)
        .where(
            MerchantRule.user_id == user.id,
            MerchantRule.deleted_at.is_(None),
            Category.deleted_at.is_(None),
        )
    )
    return {
        merchant: _LearnedRule(category_id=category_id, kind=kind)
        for merchant, category_id, kind in session.execute(stmt)
    }


def _known_fingerprints(session: Session, user: User) -> set[str]:
    stmt = select(Transaction.fingerprint).where(
        Transaction.user_id == user.id,
        Transaction.deleted_at.is_(None),
        Transaction.fingerprint.is_not(None),
    )
    return {value for value in session.scalars(stmt) if value}


def _fingerprint_of(row: ImportCandidate, user: User) -> Fingerprint:
    return build_fingerprint(
        occurred_on=ledger.local_date(row.occurred_at, ledger.user_tz(user)),
        amount=Money(row.amount),
        type=row.type,
        merchant=row.merchant,
    )


def _learn_rule(session: Session, user: User, row: ImportCandidate) -> None:
    """저장한 상호와 분류를 기억한다. 다음 분석에서 이 규칙이 모델보다 앞선다.

    지출과 수입만 기억한다. 수입도 월급·용돈·기타 수입으로 갈리므로 고른 것을 기억할 값이 있다.
    이체는 분류가 하나뿐이고, 환불은 되돌릴 지출의 분류를 따라가서 기억할 것이 없다.

    상호 하나에 규칙은 하나다. 같은 상호를 지출로도 수입으로도 적으면 나중에 저장한 쪽이
    앞의 것을 덮는다. 덮인 종류의 후보에는 이 규칙이 붙지 않고 모델이 고른 이름으로 돌아간다.
    """
    if not row.merchant_normalized or row.category_id is None:
        return
    if row.type not in (TransactionType.EXPENSE, TransactionType.INCOME):
        return
    existing = session.scalars(
        select(MerchantRule).where(
            MerchantRule.user_id == user.id,
            MerchantRule.merchant_normalized == row.merchant_normalized,
        )
    ).first()
    if existing is None:
        session.add(
            MerchantRule(
                user_id=user.id,
                merchant_normalized=row.merchant_normalized,
                merchant=row.merchant,
                category_id=row.category_id,
                applied_count=1,
            )
        )
        return
    existing.deleted_at = None
    existing.merchant = row.merchant
    existing.category_id = row.category_id
    existing.applied_count += 1


def _record_usage(
    session: Session,
    user: User,
    *,
    client: LlmStructuredClient,
    source: TransactionSource,
    input_length: int,
    redacted_count: int,
    candidate_count: int,
    model: str,
    escalated: bool,
) -> None:
    session.add(
        ParseUsage(
            user_id=user.id,
            source=source,
            provider=client.provider,
            is_stub=client.is_stub,
            input_length=input_length,
            redacted_count=redacted_count,
            candidate_count=candidate_count,
            model=model,
            escalated=escalated,
        )
    )
    session.commit()


def _require_quota(session: Session, user: User, today: date, *, label: str) -> None:
    """쓸 수 있는 만큼을 넘겼는지 본다. 하루치와 **몰아치기** 둘을 함께 본다.

    하루 상한은 넉넉하다. 습관이 붙기 전에 막으면 앱을 쓸 이유가 사라진다.
    막혀도 키패드 기록은 그대로 돌아간다.

    하루 상한만으로는 몇 초 만에 하루치를 다 태우는 것을 못 막는다. 그 한 번이 모델 비용이고
    토스 API 한도라, 1분 창을 하나 더 둔다. **사람은 1분에 사진 열 장을 고르고 검토할 수
    없다.** 실패한 호출은 세지 않는다(성공했을 때만 `ParseUsage` 한 줄이 남는다).

    줄글·캡처·영수증이 같은 상한을 나눠 쓴다. label 은 사용자에게 무엇을 다 썼는지 말해 주는
    문구일 뿐이고, 지금은 셋을 따로 세지 않는다.
    """
    settings = get_settings()
    start, _ = ledger.day_bounds(today, ledger.user_tz(user))
    if _used_since(session, user, start) >= settings.nl_parse_daily_limit:
        raise ApiError(
            ErrorCode.USAGE_LIMIT,
            f"오늘은 {label}을 충분히 썼어요. 키패드로는 계속 기록할 수 있어요.",
            status_code=429,
        )

    window = datetime.now(UTC) - timedelta(seconds=settings.nl_parse_burst_window_seconds)
    if _used_since(session, user, window) >= settings.nl_parse_burst_limit:
        raise ApiError(
            ErrorCode.USAGE_LIMIT,
            "조금 빠르게 이어서 부르고 있어요. 잠시 뒤에 다시 해 주세요.",
            status_code=429,
        )


def _used_since(session: Session, user: User, since: datetime) -> int:
    used = session.scalar(
        select(func.count())
        .select_from(ParseUsage)
        .where(ParseUsage.user_id == user.id, ParseUsage.created_at >= since)
    )
    return used or 0
