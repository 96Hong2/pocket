import { Link, useNavigate } from 'react-router';

import { ROUTES, bookSettingsPath } from '../../app/router/routes';
import { useBooks, useMe, type BookOut } from '../../shared/api';
import {
  Button,
  Card,
  CategoryAvatar,
  Chip,
  ErrorState,
  LoadingState,
  iconUrl,
} from '../../shared/ui';
import { bookKindIcon, splitBooks } from '../books';

/**
 * 같이 쓰는 가계부 목록. 관리 탭에서 들어온다.
 *
 * 줄을 누르면 그 가계부 설정으로 간다. 없으면 그림 하나와 만들기 버튼 하나만 둔다.
 */
export function BookList() {
  const navigate = useNavigate();
  const me = useMe();
  const books = useBooks();
  const enabled = me.data?.shared_books_enabled === true;

  if (me.isPending || (enabled && books.isPending)) {
    return <LoadingState variant="rows" rows={2} />;
  }
  if (me.isError || books.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void me.refetch();
          void books.refetch();
        }}
      />
    );
  }
  if (!enabled) {
    return <p className="books-page__off">지금은 같이 쓰는 가계부를 열 수 없어요</p>;
  }

  const { active, ended } = splitBooks(books.data?.items ?? []);
  const create = () => navigate(ROUTES.bookNew);

  if (active.length === 0 && ended.length === 0) {
    return (
      <Card padding="lg" className="books-page__empty">
        <img className="books-page__picture" src={iconUrl('59_people')} alt="" aria-hidden="true" />
        <p className="books-page__empty-text">링크 하나로 초대해요</p>
        <Button fullWidth onClick={create}>
          같이 쓸 가계부 만들기
        </Button>
      </Card>
    );
  }

  return (
    <>
      {active.length > 0 ? <BookRows books={active} /> : null}

      {ended.length > 0 ? (
        <section className="books-page__section" aria-labelledby="books-ended">
          <h2 id="books-ended" className="books-page__label">
            끝난 가계부
          </h2>
          <BookRows books={ended} />
        </section>
      ) : null}

      <Button fullWidth className="books-page__create" onClick={create}>
        같이 쓸 가계부 만들기
      </Button>
    </>
  );
}

function BookRows({ books }: { books: BookOut[] }) {
  return (
    <Card padding="list">
      <ul className="link-rows">
        {books.map((book) => (
          <li key={book.id}>
            <Link className="link-row books-page__row" to={bookSettingsPath(book.id)}>
              <CategoryAvatar icon={bookKindIcon(book.kind)} size={44} />
              <span className="link-row__label books-page__name">{book.name}</span>
              {book.my_role === 'owner' ? <Chip variant="kind">관리자</Chip> : null}
              <span className="link-row__value">{book.active_member_count}명</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
