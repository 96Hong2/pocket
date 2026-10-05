"""추출 프롬프트.

한 곳에만 둔다. 화면마다 프롬프트를 새로 지어내지 않는다.
"계산하지 말라"는 지시가 여기 한 번만 있으면 되게 한다.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import date
from typing import NamedTuple

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
- 가계부는 이미 쓴 돈을 적는 곳이라 **{today} 보다 뒤인 날짜는 고르지 않는다.**
  '9/16' 처럼 연도 없이 적힌 날짜가 올해로 보면 앞날이 되면 지난해로 읽는다.
  '내일'·'모레'처럼 앞날을 가리키는 말이 있으면 날짜를 null 로 둔다.
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


# 공유 가계부에 적으려고 읽는지 스텁이 가르는 표지. 영수증 표지처럼 문구를 고쳐도 남긴다.
SHARED_BOOK_MARKER = "같이 쓰는 공유 가계부"

_SHARED_BOOK_TASK = (
    f"읽은 것은 여럿이 {SHARED_BOOK_MARKER}에 적힌다. 분류는 위 목록에 있는 이름만 고른다."
)

_CATEGORY_LINE = re.compile(r"맞는 것이 없으면 null 로 둔다: (.+)")


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


def for_shared_book(prompt: str) -> str:
    """공유 가계부에 적을 때 덧붙인다. 분류 이름은 부르는 쪽이 그 가계부 것으로 준다."""
    return f"{prompt}\n{_SHARED_BOOK_TASK}"


def listed_categories(prompt: str) -> tuple[str, ...]:
    """프롬프트에 적어 보낸 분류 이름. 스텁이 모델 흉내를 낼 때만 쓴다."""
    found = _CATEGORY_LINE.search(prompt)
    if found is None:
        return ()
    return tuple(name for name in found.group(1).split(", ") if name)


class AssetHint(NamedTuple):
    """모델에게 보여 줄 자산 항목 이름. monthly 면 다달이 넣는 항목이다."""

    name: str
    monthly: bool = False


# 자산 항목 목록을 줬는지(저축·투자를 읽으라고 했는지) 스텁이 가르는 표지. 문구를 고쳐도 남긴다.
ASSET_TASK_MARKER = "자산 항목:"
# 자산 캡처 지시라는 표지.
ASSET_CAPTURE_MARKER = "잔액 화면"

MAX_ASSET_HINTS = 40
_NO_ASSETS = "(아직 없음)"
_MONTHLY = "(매달)"
_ASSET_LINE = re.compile(rf"{ASSET_TASK_MARKER} (.+)")

_ASSET_TASK = f"""\
- 저축·투자(적금·예금·청약·IRP·연금에 넣은 돈, 주식·ETF·코인을 산 돈)는 type 을 transfer 로
  두고 asset_name 에 어디에 넣었는지 적는다. category 는 null 로 둔다.
- asset_name 은 아래 자산 항목 중 맞는 것이 있으면 그 이름을 그대로 쓴다. 「{_MONTHLY}」 는 다달이
  넣는 항목이라는 표시이고 이름에 넣지 않는다. 맞는 것이 없으면 입력에 적힌 이름을 옮긴다.
  {ASSET_TASK_MARKER} {{names}}
- 주식·ETF·코인을 몇 주(개) 샀는지 적혀 있으면 asset_quantity 에 그 수를 옮긴다. 없으면 null.
- 계좌번호는 asset_name 에 적지 않는다.
- 저축·투자가 아닌 줄은 asset_name, asset_quantity 를 null 로 둔다.
"""

_ASSET_CAPTURE_TASK = f"""\
너는 은행·증권 앱의 {ASSET_CAPTURE_MARKER} 캡처를 읽는 파서다. 아래 규칙을 지킨다.

- 주어진 스키마에 맞는 JSON 만 낸다. 설명 문장을 덧붙이지 않는다.
- 화면에 보이는 통장·상품·종목마다 rows 에 한 줄씩 넣는다. name 은 이름, amount 는 그 줄의 잔액
  (평가금액) 숫자다. 부호 없는 정수(원)로 옮긴다. 대출 잔액도 양수로 적는다.
- 잔액 숫자만 옮긴다. 합계·수익·이자·수익률을 계산하지 않는다.
- 증권 앱 보유 화면처럼 종목 줄에 보이면 더 옮긴다. 화면에 없으면 null 이다. 계산해서 채우지 않는다.
  kind: stock(주식) / etf / fund(펀드) / coin(코인) / bond(채권).
  quantity: 보유 수량(주·좌·개). 화면 숫자 그대로.
  purchase: 매입금액이나 투자원금. 부호 없는 정수(원).
  profit: purchase 가 안 보일 때만 평가손익(수익금). 손해면 음수 정수(원).
- 「총 자산」 같은 합계 줄은 넣지 않는다.
- 계좌번호와 카드번호는 어디에도 적지 않는다. 이름에 붙어 있으면 떼고 이름만 적는다.
- group 은 cash(입출금·예금·적금·청약·CMA) / investment(주식·ETF·펀드·코인)
  / pension(연금저축·IRP·퇴직연금) / deposit(보증금·기타) / debt(대출) 중 하나다. 모르면 null.
- 아래 기존 항목과 같은 것이면 그 이름을 그대로 쓴다. 「{_MONTHLY}」 는 이름에 넣지 않는다.
  {ASSET_TASK_MARKER} {{names}}
- 잔액이 보이지 않는 그림이면 rows 를 빈 목록으로 둔다. 지어내지 않는다.
"""


def _asset_names_line(hints: Sequence[AssetHint]) -> str:
    seen: dict[str, bool] = {}
    for hint in hints:
        # 목록을 쉼표로 끊으므로 이름 안의 쉼표와 줄바꿈은 빈칸으로 바꾼다.
        cleaned = " ".join(re.sub(r"[,\n\r]+", " ", hint.name).split())
        if cleaned:
            seen[cleaned] = seen.get(cleaned, False) or hint.monthly
    names = [f"{name}{_MONTHLY if monthly else ''}" for name, monthly in seen.items()][
        :MAX_ASSET_HINTS
    ]
    return ", ".join(names) or _NO_ASSETS


def with_assets(prompt: str, hints: Sequence[AssetHint]) -> str:
    """저축·투자를 읽으라고 덧붙인다. 공유 가계부 묶음에는 붙이지 않는다(부르는 쪽이 거른다)."""
    return f"{prompt}\n{_ASSET_TASK.format(names=_asset_names_line(hints))}"


def asset_capture_prompt(hints: Sequence[AssetHint]) -> str:
    return _ASSET_CAPTURE_TASK.format(names=_asset_names_line(hints))


def listed_asset_names(prompt: str) -> tuple[AssetHint, ...]:
    """프롬프트에 적어 보낸 자산 항목. 스텁이 모델 흉내를 낼 때만 쓴다."""
    found = _ASSET_LINE.search(prompt)
    if found is None or found.group(1) == _NO_ASSETS:
        return ()
    hints = []
    for part in found.group(1).split(", "):
        monthly = part.endswith(_MONTHLY)
        name = part.removesuffix(_MONTHLY)
        if name:
            hints.append(AssetHint(name, monthly))
    return tuple(hints)


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
