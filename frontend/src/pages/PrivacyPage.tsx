import { Card } from '../shared/ui';

/** 개인정보처리방침. 실제로 그렇게 동작하는 것만 적는다. */
export default function PrivacyPage() {
  return (
    <div className="page">
      <h1 className="page__title">개인정보처리방침</h1>
      <p className="page__lead">무엇을 저장하고 무엇을 안 남기는지 적어 뒀어요</p>

      <div className="privacy">
        <Card>
          <h2 className="privacy__title">사진</h2>
          <p className="privacy__text">
            캡처와 영수증 원본 이미지는 저장하지 않아요. 서버가 파일로 옮겨 적지 않고, 분석이 끝나는
            순간 사라져요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">저장하는 것</h2>
          <ul className="privacy__list">
            <li className="privacy__item">결제한 날짜와 시각</li>
            <li className="privacy__item">금액과 종류(지출·수입·이체·환불)</li>
            <li className="privacy__item">상호명</li>
            <li className="privacy__item">분류</li>
            <li className="privacy__item">직접 정한 예산과 앱 설정</li>
          </ul>
        </Card>

        <Card>
          <h2 className="privacy__title">저장하지 않는 것</h2>
          <ul className="privacy__list">
            <li className="privacy__item">카드번호와 계좌번호. 뒷자리도 남기지 않아요</li>
            <li className="privacy__item">이름, 전화번호, 이메일</li>
            <li className="privacy__item">캡처와 영수증 원본 이미지</li>
            <li className="privacy__item">분석에 보낸 글과 돌려받은 답의 원문</li>
          </ul>
          <p className="privacy__text">기록(로그)과 통계에도 같은 것들을 남기지 않아요.</p>
        </Card>

        <Card>
          <h2 className="privacy__title">분석에 보내기 전</h2>
          <p className="privacy__text">
            직접 적어 넣은 글은 카드번호, 계좌번호, 전화번호를 가린 뒤에 보내요. 돌려받은 상호명에
            번호가 섞여 있으면 그것도 가려서 저장해요.
          </p>
          <p className="privacy__text">
            사진은 찍혀 있는 글자를 가릴 수 없어요. 카드번호나 잔액이 보이는 사진은 그 부분을 가리고
            올려 주세요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">누구인지 아는 방법</h2>
          <p className="privacy__text">
            로그인하지 않아요. 이름도 전화번호도 받지 않고, 토스가 주는 익명 식별키 하나로만
            사용자를 갈라요.
          </p>
          <p className="privacy__text">
            이 값은 미니앱마다 다르게 만들어져요. 이 앱 밖에서는 같은 사람인지 알아볼 수 없어요.
          </p>
        </Card>
      </div>
    </div>
  );
}
