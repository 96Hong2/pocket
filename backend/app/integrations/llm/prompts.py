"""추출 프롬프트.

한 곳에만 둔다. 화면마다 프롬프트를 새로 지어내지 않는다.
"계산하지 말라"는 지시가 여기 한 번만 있으면 되게 한다.
"""

from __future__ import annotations

from app.integrations.llm.contracts import DEFAULT_CATEGORY_HINTS

_RULES = """\
너는 가계부 입력을 구조화하는 파서다. 아래 규칙을 지킨다.

- 주어진 스키마에 맞는 JSON 만 낸다. 설명 문장을 덧붙이지 않는다.
- 금액은 부호 없는 정수(원)로 낸다. 의미는 type 으로 구분한다.
- type 은 expense(지출) / income(수입) / transfer(이체) / refund(환불) 중 하나다.
- 합계·잔액·차액·평균을 계산하지 않는다. 입력에 적힌 값을 옮기기만 한다.
- 입력에 없는 값을 지어내지 않는다. 모르면 null 로 둔다. 날짜도 추측하지 않는다.
- 확실하지 않을수록 confidence 를 낮게 준다. confidence 는 0~1 이다.
- 분류 후보는 다음 중에서 고른다. 맞는 것이 없으면 null 로 둔다: {categories}
"""

_TEXT_TASK = "입력은 사용자가 쓴 한 줄짜리 줄글이다. 거래 후보를 뽑는다."

_SCREENSHOT_TASK = (
    "입력은 결제 내역 캡처 이미지다. 보이는 거래만 뽑는다. 가려지거나 잘린 항목은 만들지 않는다."
)


def _base() -> str:
    return _RULES.format(categories=", ".join(DEFAULT_CATEGORY_HINTS))


def natural_language_prompt() -> str:
    return f"{_base()}\n{_TEXT_TASK}"


def screenshot_prompt() -> str:
    return f"{_base()}\n{_SCREENSHOT_TASK}"
