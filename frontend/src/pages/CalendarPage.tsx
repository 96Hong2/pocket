import { Placeholder } from './Placeholder';

/** 월간 달력. 홈에서 들어오는 전체 내역 화면이다. */
export default function CalendarPage() {
  return (
    <div className="page">
      <h1 className="page__title">월간 달력</h1>
      <p className="page__lead">날짜별로 얼마 썼는지 한눈에 봐요</p>

      <Placeholder label="월 이동">MonthStepper 하나만 쓴다.</Placeholder>
      <Placeholder label="달력 격자">날짜칸에 지출·수입 합계를 넣는다.</Placeholder>
      <Placeholder label="선택한 날 내역">TransactionRow 목록이 들어간다.</Placeholder>
    </div>
  );
}
