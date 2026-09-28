import { useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { BOOK_ID_QUERY } from '../app/router/routes';
import { BookSettle } from '../features/book-manage';
import { useBook } from '../shared/api';

/**
 * 정산. 우리 집 홈의 정산 카드에서 들어온다. 광고를 두지 않는다.
 *
 * 제목에 가계부 이름을 붙인다(「우리 집 정산」). 창 제목(`document.title`)은 「정산」 그대로다.
 * 이름을 아직 모르거나 열 수 없는 가계부면 「정산」 만 적는다.
 */
export default function BookSettlePage() {
  const [params] = useSearchParams();
  const raw = params.get(BOOK_ID_QUERY);
  const bookId = raw === '' ? null : raw;
  const book = useBook(bookId);
  const name = book.data?.name;

  return (
    <div className="page">
      <h1 className="page__title">{name == null ? '정산' : `${name} 정산`}</h1>

      <IdentityNotice />

      <BookSettle key={raw ?? ''} bookId={bookId} />
    </div>
  );
}
