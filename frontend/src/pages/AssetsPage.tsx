import { Placeholder } from './Placeholder';

/** 자산관리. P1 이라 모델만 있고 화면은 자리만 잡아 둔다. */
export default function AssetsPage() {
  return (
    <div className="page">
      <h1 className="page__title">자산</h1>
      <p className="page__lead">P1 화면이에요. 지금은 자리만 잡아 뒀어요</p>

      <Placeholder label="순자산">자산 합계에서 부채 합계를 뺀 값이다.</Placeholder>
      <Placeholder label="자산 목록">그룹별 항목이 들어간다.</Placeholder>
    </div>
  );
}
