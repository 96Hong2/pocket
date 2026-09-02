import { Placeholder } from './Placeholder';

/** 리포트 탭. 카테고리 도넛·기간 비교가 들어갈 자리다. */
export default function ReportPage() {
  return (
    <div className="page">
      <h1 className="page__title">리포트</h1>
      <p className="page__lead">이번 달 지출이 어디로 갔는지 봐요</p>

      <Placeholder label="기간 선택">MonthSelector 하나만 쓴다.</Placeholder>
      <Placeholder label="카테고리 도넛">도넛 램프 색으로 카테고리 비중을 그린다.</Placeholder>
      <Placeholder label="카테고리 목록">카테고리별 지출과 게이지가 들어간다.</Placeholder>
    </div>
  );
}
