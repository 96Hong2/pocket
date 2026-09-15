import { describe, expect, it } from 'vitest';

import { editAmount, formatAmountInput } from './amountEdit';

/**
 * 커서 자리는 화면 캡쳐로 증명하기 어렵다. 여기서만 못 박는다.
 * `next` 와 `caret` 은 브라우저가 편집을 마친 뒤 input 이 들고 있는 값이다.
 */
describe('editAmount', () => {
  it('콤마 위 Backspace 는 그 앞 숫자 한 자리를 지운다', () => {
    // `1,200,000` 에서 첫 콤마 바로 뒤에 커서를 두고 Backspace. 콤마만 사라진 상태로 들어온다.
    expect(editAmount({ previous: '1,200,000', next: '1200,000', caret: 1 })).toEqual({
      digits: '200000',
      caret: 0,
    });
  });

  it('콤마를 지운 뒤 커서가 맨 끝으로 튀지 않는다', () => {
    // `12,345,678` 의 둘째 콤마를 지우면 `5` 가 빠지고 커서는 그 자리에 남는다.
    expect(editAmount({ previous: '12,345,678', next: '12,345678', caret: 6 })).toEqual({
      digits: '1234678',
      caret: 5,
    });
  });

  it('숫자 위 Backspace 는 그 숫자만 지운다', () => {
    expect(editAmount({ previous: '1,200', next: '1,00', caret: 2 })).toEqual({
      digits: '100',
      caret: 1,
    });
  });

  it('가운데에 끼워 넣은 숫자 뒤에 커서가 남는다', () => {
    expect(editAmount({ previous: '1,200', next: '15,200', caret: 2 })).toEqual({
      digits: '15200',
      caret: 2,
    });
  });

  it('끝에 이어 적으면 커서도 끝에 있다', () => {
    expect(editAmount({ previous: '1,200', next: '1,2005', caret: 6 })).toEqual({
      digits: '12005',
      caret: 6,
    });
  });

  it('숫자가 아닌 글자는 무시하고 커서를 그 앞에 둔다', () => {
    expect(editAmount({ previous: '1,200', next: '1,200a', caret: 6 })).toEqual({
      digits: '1200',
      caret: 5,
    });
  });

  it('앞자리 0 은 버리되 0 하나는 남긴다', () => {
    // 0 을 쳤는데 칸이 비면 왜 사라졌는지 알 수 없다. 잔액 0 원 계좌를 자산에 얹는 길이기도 하다.
    expect(editAmount({ previous: '', next: '0', caret: 1 })).toEqual({ digits: '0', caret: 1 });
    expect(editAmount({ previous: '5', next: '05', caret: 1 })).toEqual({
      digits: '5',
      caret: 0,
    });
  });

  it('붙여넣은 금액의 소수점 아래를 버린다', () => {
    // 은행 앱에서 복사하면 `12,000.00` 이다. 점을 그냥 지우면 1,200,000 원이 된다.
    expect(editAmount({ previous: '', next: '12,000.00', caret: 9 })).toEqual({
      digits: '12000',
      caret: 6,
    });
    expect(editAmount({ previous: '', next: '4,500.5원', caret: 9 })).toEqual({
      digits: '4500',
      caret: 5,
    });
    // 소수점이 없는 붙여넣기는 그대로다.
    expect(editAmount({ previous: '', next: '1,200,000원', caret: 11 })).toEqual({
      digits: '1200000',
      caret: 9,
    });
  });

  it('골라 둔 전체를 같은 자릿수로 갈아 끼워도 한 자리가 사라지지 않는다', () => {
    // `400,000` 을 통째로 고르고 `700000` 을 붙여 넣은 경우다. 콤마가 빠져 한 글자 짧아지는데,
    // 자릿수만 세면 콤마 삭제로 읽혀 `70,000` 이 된다.
    expect(editAmount({ previous: '400,000', next: '700000', caret: 6 })).toEqual({
      digits: '700000',
      caret: 7,
    });
  });

  it('전부 지우면 빈 값이 된다', () => {
    expect(editAmount({ previous: '1,200', next: '', caret: 0 })).toEqual({
      digits: '',
      caret: 0,
    });
  });

  it('12자리를 넘겨 적을 수 없다', () => {
    const result = editAmount({ previous: '', next: '1234567890123', caret: 13 });
    expect(result.digits).toBe('123456789012');
  });
});

describe('formatAmountInput', () => {
  it('세 자리마다 콤마를 찍는다', () => {
    expect(formatAmountInput('1200000')).toBe('1,200,000');
  });

  it('빈 값은 빈 문자열이다', () => {
    expect(formatAmountInput('')).toBe('');
  });
});
