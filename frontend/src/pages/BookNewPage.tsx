import { IdentityNotice } from '../app/IdentityNotice';
import { BookCreate } from '../features/book-manage';

/** 가계부 만들기. 제목은 단계마다 달라 화면이 그린다. 광고를 두지 않는다. */
export default function BookNewPage() {
  return (
    <div className="page">
      <IdentityNotice />
      <BookCreate />
    </div>
  );
}
