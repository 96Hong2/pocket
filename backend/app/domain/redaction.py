"""모델에 보내기 전에 가리는 규칙.

저장하지 않는 것만으로는 부족하다. 카드·계좌·전화번호가 섞인 줄글을 그대로 보내면
원문이 외부 모델 쪽 기록에 남는다. 그래서 요청을 만들기 전에 이 함수를 지난다.

로깅에도 성격이 비슷한 그물이 있지만(`app/core/logging.py`) 그쪽은 실수로 흘러나온 값을
출력 직전에 막는 마지막 방어선이다. 여기는 요청을 만들기 전에 값 자체를 바꾼다.
목적이 달라 규칙도 다르다. 여기는 구분자 없는 카드번호까지 본다.

금액을 가려 버리면 가계부가 성립하지 않는다. 그래서 기준은 자릿수와 구분자 모양이다.
`12000 45000` 처럼 띄어 쓴 금액 둘을 하나의 긴 번호로 읽지 않는다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

__all__ = ["MASK", "Redacted", "redact"]

MASK = "[가림]"

# 사람이 쓰는 금액의 자릿수를 넘는 것만 가린다.
_MIN_DIGITS = 10

_PATTERNS = (
    # 구분자 없이 이어 붙인 카드·계좌번호.
    re.compile(r"(?<!\d)\d{10,}(?!\d)"),
    # 하이픈으로 끊은 계좌·전화번호·주민등록번호.
    # 자릿수 합이 기준을 넘을 때만 가린다. 그래야 날짜와 갈린다.
    # 그룹 하나가 7자리를 넘는 계좌번호가 실제로 있다(3333-01-1234567). 위를 좁게 잡으면
    # 정규식이 앞 두 조각만 먹고 자릿수 문턱에 걸려 통째로 그냥 지나간다.
    re.compile(r"(?<!\d)\d{2,12}(?:-\d{2,12}){1,4}(?!\d)"),
    # 네 자리씩 띄어 쓴 카드번호.
    re.compile(r"(?<!\d)\d{4}(?: \d{4}){3}(?!\d)"),
)


@dataclass(frozen=True, slots=True)
class Redacted:
    text: str
    count: int

    @property
    def changed(self) -> bool:
        return self.count > 0


def redact(text: str) -> Redacted:
    """카드·계좌·전화번호로 보이는 숫자를 가린다. 가린 횟수도 함께 돌려준다."""
    count = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal count
        chunk = match.group(0)
        if sum(ch.isdigit() for ch in chunk) < _MIN_DIGITS:
            return chunk
        count += 1
        return MASK

    result = text
    for pattern in _PATTERNS:
        result = pattern.sub(replace, result)
    return Redacted(text=result, count=count)
