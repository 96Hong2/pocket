"""추출 프롬프트.

한 곳에만 둔다. 화면마다 프롬프트를 새로 지어내지 않는다.
"계산하지 말라"는 지시가 여기 한 번만 있으면 되게 한다.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from app.integrations.llm.contracts import DEFAULT_CATEGORY_HINTS

_RULES = """\
너는 가계부 입력을 구조화하는 파서다. 아래 규칙을 지킨다.

- 주어진 스키마에 맞는 JSON 만 낸다. 설명 문장을 덧붙이지 않는다.
- 금액은 부호 없는 정수(원)로 낸다. 의미는 type 으로 구분한다.
- type 은 expense(지출) / income(수입) / transfer(이체) / refund(환불) 중 하나다.
- 합계·잔액·차액·평균을 계산하지 않는다. 입력에 적힌 값을 옮기기만 한다.
- 입력에 없는 값을 지어내지 않는다. 모르면 null 로 둔다.
- 확실하지 않을수록 confidence 를 낮게 준다. confidence 는 0~1 이다.
- 분류 후보는 다음 중에서 고른다. 맞는 것이 없으면 null 로 둔다: {categories}
- payment_method 는 입력에 적혀 있을 때만 고른다. '신용'·'일시불'·'할부' 는 credit,
  '체크'·'직불' 은 debit, '현금'·'계좌이체'·'무통장' 은 cash 다. 안 적혀 있으면 null 로 둔다.
"""

_TODAY_RULE = """\
- 오늘은 {today} 다. '어제'·'그제'처럼 적힌 말만 이 날짜를 기준으로 옮겨 적는다.
  날짜를 적지 않은 항목은 null 로 둔다. 오늘로 채우지 않는다.
"""

_NO_DATE_RULE = "- 날짜도 추측하지 않는다. 확실하지 않으면 null 로 둔다.\n"

_TEXT_TASK = "입력은 사용자가 쓴 줄글이다. 거래 후보를 뽑는다. 한 줄에 여러 건이 있을 수 있다."

_SCREENSHOT_TASK = (
    "입력은 결제 내역 캡처 이미지다. 보이는 거래만 뽑는다. 가려지거나 잘린 항목은 만들지 않는다."
)

# 영수증 지시를 받았는지 스텁이 가르는 표지. 스텁은 이미지를 안 보고 프롬프트만 볼 수 있어서,
# 이 조각이 없으면 영수증 한 장에도 캡처용 예시 다섯 건이 나온다. 문구를 고쳐도 이 말은 남긴다.
RECEIPT_TASK_MARKER = "종이 영수증"

_RECEIPT_TASK = (
    f"입력은 {RECEIPT_TASK_MARKER} 한 장이다. 인쇄된 결제 총액 한 건만 옮긴다."
    " 품목을 따로 나누지 않는다. 총액·상호·날짜 중 못 읽은 것은 null 로 둔다."
)


# 프롬프트에 적는 분류 이름의 최대 개수. 사람이 분류를 수십 개 만들면 목록이 지시보다
# 길어져 나머지 규칙이 묻힌다. 넘치면 앞에서부터 자른다(정렬 순서가 곧 자주 쓰는 순서다).
MAX_CATEGORY_HINTS = 40


def category_hints(names: Sequence[str] | None) -> tuple[str, ...]:
    """모델에게 보여 줄 분류 이름.

    **내가 만든 분류도 넣는다.** 기본 목록만 주면 '데이트' 를 만들어 둔 사람이 줄글이나
    캡처로 적을 때마다 모델이 그 이름을 영영 못 고르고 '여가·취미' 로 흘린다.
    안 주면 기본 목록으로 돌아간다(테스트와 스텁이 쓴다).
    """
    if not names:
        return DEFAULT_CATEGORY_HINTS
    seen: dict[str, None] = {}
    for name in names:
        cleaned = name.strip()
        if cleaned:
            seen.setdefault(cleaned, None)
    return tuple(seen)[:MAX_CATEGORY_HINTS] or DEFAULT_CATEGORY_HINTS


def _base(today: date | None, categories: Sequence[str] | None) -> str:
    rules = _RULES.format(categories=", ".join(category_hints(categories)))
    return rules + (_TODAY_RULE.format(today=today.isoformat()) if today else _NO_DATE_RULE)


def natural_language_prompt(
    today: date | None = None, categories: Sequence[str] | None = None
) -> str:
    return f"{_base(today, categories)}\n{_TEXT_TASK}"


def screenshot_prompt(today: date | None = None, categories: Sequence[str] | None = None) -> str:
    return f"{_base(today, categories)}\n{_SCREENSHOT_TASK}"


def receipt_prompt(today: date | None = None, categories: Sequence[str] | None = None) -> str:
    return f"{_base(today, categories)}\n{_RECEIPT_TASK}"


# 다시 읽어 달라고 할 때 앞에 붙인다. 무엇이 이상했는지 구체적으로 말해 줘야
# 같은 답을 한 번 더 내지 않는다.
_RETRY_LEAD = (
    "앞서 다른 모델이 같은 입력을 읽었는데 아래가 이상했다.\n{problems}\n"
    "다시 처음부터 읽는다. 앞의 답을 참고하지 말고, 이상하다고 지적된 곳은 특히 꼼꼼히 본다."
    " 그래도 못 읽겠으면 지어내지 말고 null 과 낮은 confidence 로 둔다.\n"
)


def retry_prompt(base: str, problems: str) -> str:
    """1차 결과가 서버 검증에 걸렸을 때 두 번째 모델에게 주는 지시."""
    return _RETRY_LEAD.format(problems=problems) + base
