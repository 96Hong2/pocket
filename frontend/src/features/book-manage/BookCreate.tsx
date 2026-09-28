import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useBookView, useOverlayBackClose } from '../../app/providers';
import { ROUTES } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  useBooks,
  useCreateBook,
  type BookKind,
  type SettleRule,
} from '../../shared/api';
import { Button, CategoryAvatar } from '../../shared/ui';
import {
  BOOK_KINDS,
  bookKindIcon,
  bookKindLabel,
  bookNameWithSuffix,
  defaultBookName,
  defaultSettleRule,
  myNameIn,
  settleRuleLabel,
  useBookInvite,
} from '../books';

import { BookField } from './BookField';

/** 유형 카드 아래 한 줄. 무엇을 적는 가계부인지 떠올리게만 한다. */
const KIND_LINE: Record<BookKind, string> = {
  couple: '둘이 같이 내는 돈',
  family: '집안 살림',
  trip: '여행이나 모임 비용',
  room: '월세와 생필품',
};

/** 돈 나누기 칸 아래 한 줄. 고르면 무엇이 달라지는지만 말한다. */
function ruleLine(kind: BookKind, rule: SettleRule): string {
  if (rule === 'none') return '정산 없이 같이 쓴 돈만 적어요';
  return kind === 'couple' || kind === 'room'
    ? '누가 더 냈는지 계산해 줘요'
    : '인원수대로 나눠 계산해 줘요';
}

/** 미리 골라 둔 것이 먼저 선다. */
function ruleOptions(kind: BookKind): SettleRule[] {
  return defaultSettleRule(kind) === 'even' ? ['even', 'none'] : ['none', 'even'];
}

/**
 * 가계부 만들기. 한 화면 안에서 두 단계로 간다.
 *
 * 1. 누구와 쓰나: 카드를 누르면 곧바로 다음 단계다. 확인 버튼이 없다.
 * 2. 돈 나누기와 내 이름: 이름과 돈 나누기는 유형에 맞춰 미리 채워 둔다. 채울 것은 내 이름 하나다.
 *
 * 「만들고 초대하기」 한 번에 만들기, 초대 링크, 토스 공유창이 이어진다. 공유창에서 돌아오면
 * 결과와 상관없이 그 가계부 홈이다. 혼자인 홈에 초대장을 다시 보낼 자리가 있다.
 */
export function BookCreate() {
  const [kind, setKind] = useState<BookKind | null>(null);

  if (kind == null) return <KindStep onPick={setKind} />;
  return <DetailStep key={kind} kind={kind} onBack={() => setKind(null)} />;
}

function KindStep({ onPick }: { onPick: (kind: BookKind) => void }) {
  return (
    <div className="book-create">
      <p className="book-create__step">1/2</p>
      <h1 className="page__title">누구와 같이 쓰나요</h1>
      <p className="page__lead">고르면 이름과 분류를 맞춰 둘게요</p>

      <ul className="book-create__kinds">
        {BOOK_KINDS.map((kind) => (
          <li key={kind}>
            <button type="button" className="book-create__kind" onClick={() => onPick(kind)}>
              <CategoryAvatar icon={bookKindIcon(kind)} size={44} />
              <span className="book-create__kind-name">{bookKindLabel(kind)}</span>
              <span className="book-create__kind-line">{KIND_LINE[kind]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailStep({ kind, onBack }: { kind: BookKind; onBack: () => void }) {
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const { setViewingBookId } = useBookView();
  const books = useBooks();
  const create = useCreateBook();
  const invite = useBookInvite('create');

  const [rule, setRule] = useState<SettleRule>(defaultSettleRule(kind));
  // 다른 가계부에서 쓰던 이름. 목록이 늦게 오면 사람이 손대기 전까지만 따라간다.
  const [typedName, setTypedName] = useState<string | null>(null);
  const myName = typedName ?? myNameIn(books.data?.items ?? []) ?? '';
  const [customizing, setCustomizing] = useState(false);
  const [bookName, setBookName] = useState(defaultBookName(kind));
  const [busy, setBusy] = useState(false);

  // 두 번째 단계에서 뒤로가기를 누르면 앱을 나가지 않고 첫 단계로 돌아간다.
  useOverlayBackClose(true, onBack, busy);

  const title = bookName.trim() === '' ? defaultBookName(kind) : bookName.trim();
  const canSubmit = myName.trim() !== '' && !busy;
  const message = create.error instanceof ApiError ? create.error.message : null;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const book = await create.mutateAsync({
        kind,
        name: title,
        settle_rule: rule,
        my_name: myName.trim(),
      });
      analytics.log(EVENTS.bookChanged, { action: 'created', kind }, { kind: 'click' });
      // 보냈는지는 우리 집 홈 카드가 말한다. 알림까지 띄우면 같은 말을 두 번 한다.
      await invite.send(book);
      setViewingBookId(book.id);
      navigate(ROUTES.home, { replace: true });
    } catch {
      // 만들기 실패는 아래 한 줄로 보인다. 공유 실패는 useBookInvite 가 던지지 않는다.
      setBusy(false);
    }
  }

  return (
    <div className="book-create">
      <p className="book-create__step">2/2</p>
      <h1 className="page__title book-create__title">{bookNameWithSuffix(title)}를 만들게요</h1>

      <p className="book-create__label" id="book-create-rule">
        돈 나누기
      </p>
      <div className="book-create__rules" role="radiogroup" aria-labelledby="book-create-rule">
        {ruleOptions(kind).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={rule === option}
            className="book-create__rule"
            onClick={() => setRule(option)}
          >
            <span className="book-create__rule-name">{settleRuleLabel(kind, option)}</span>
            <span className="book-create__rule-line">{ruleLine(kind, option)}</span>
          </button>
        ))}
      </div>

      <BookField
        label="내 이름"
        value={myName}
        onChange={setTypedName}
        placeholder="예: 은홍"
        maxLength={10}
        hint="같이 쓰는 사람에게 보이는 이름이에요"
      />

      {customizing ? (
        <BookField label="가계부 이름" value={bookName} onChange={setBookName} maxLength={20} />
      ) : (
        <button type="button" className="book-create__more" onClick={() => setCustomizing(true)}>
          직접 설정하기
        </button>
      )}

      {message != null ? (
        <p className="book-manage__notice" role="alert">
          {message}
        </p>
      ) : null}

      <Button
        fullWidth
        className="book-create__submit"
        disabled={!canSubmit}
        onClick={() => void submit()}
      >
        {busy ? '만드는 중이에요' : '만들고 초대하기'}
      </Button>
    </div>
  );
}
