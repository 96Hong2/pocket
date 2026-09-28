import { useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { BOOK_FROM_QUERY, BOOK_ID_QUERY } from '../app/router/routes';
import { BookSettings } from '../features/book-manage';

/** 가계부 하나의 설정. 어느 가계부인지는 `?id=` 로 받는다. 광고를 두지 않는다. */
export default function BookSettingsPage() {
  const [params] = useSearchParams();
  const bookId = params.get(BOOK_ID_QUERY);
  // 홈의 멤버 얼굴에서 왔으면 그 가계부를 이미 보고 있다. 「<이름> 열기」 를 세우지 않는다.
  const fromHome = params.get(BOOK_FROM_QUERY) === 'home';

  return (
    <div className="page">
      <h1 className="page__title">가계부 설정</h1>

      <IdentityNotice />

      <BookSettings
        key={bookId ?? ''}
        bookId={bookId === '' ? null : bookId}
        showOpen={!fromHome}
      />
    </div>
  );
}
