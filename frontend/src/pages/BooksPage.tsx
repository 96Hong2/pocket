import { IdentityNotice } from '../app/IdentityNotice';
import { BookList } from '../features/book-manage';

/** 같이 쓰는 가계부 목록. 관리 탭에서 들어온다. 광고를 두지 않는다. */
export default function BooksPage() {
  return (
    <div className="page">
      <h1 className="page__title">같이 쓰는 가계부</h1>
      <p className="page__lead">같이 쓰는 돈만 따로 적어요. 내 가계부는 그대로예요</p>

      <IdentityNotice />

      <BookList />
    </div>
  );
}
