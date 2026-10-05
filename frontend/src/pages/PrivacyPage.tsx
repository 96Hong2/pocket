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
          <p className="privacy__text">
            분류 아이콘으로 직접 고른 사진은 달라요. 앱이 작게 줄여서 올리고, 서버에 저장해요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">저장하는 것</h2>
          <ul className="privacy__list">
            <li className="privacy__item">결제한 날짜와 시각</li>
            <li className="privacy__item">금액과 종류(지출·수입·이체·환불)</li>
            <li className="privacy__item">상호명</li>
            <li className="privacy__item">분류</li>
            <li className="privacy__item">메모, 태그, 결제 수단</li>
            <li className="privacy__item">
              기록마다 키패드, 줄글, 캡처, 영수증 중 무엇으로 적었는지
            </li>
            <li className="privacy__item">
              사진이나 줄글로 읽어 온 날짜, 금액, 상호, 결제 수단. 저장한 뒤에도 서버에 남아요
            </li>
            <li className="privacy__item">반복 지출의 이름, 금액, 날짜</li>
            <li className="privacy__item">목표의 이름, 금액, 날짜와 자산의 이름, 금액</li>
            <li className="privacy__item">내가 만들거나 이름을 바꾼 분류와 그 아이콘</li>
            <li className="privacy__item">「기억한 분류」에 걸어 둔 상호와 분류</li>
            <li className="privacy__item">직접 정한 예산과 앱 설정, 알림 시각</li>
            <li className="privacy__item">사진과 줄글 읽기를 쓴 횟수와 글자 수 같은 숫자</li>
            <li className="privacy__item">골랐을 때만: 연령대와 성별</li>
            <li className="privacy__item">「이메일로 지켜 두기」를 했을 때만: 이메일 주소</li>
          </ul>
          <p className="privacy__text">
            연령대와 성별은 안 골라도 돼요. 어떤 분들이 쓰는지 보는 데만 쓰고, 누구인지 알아내는
            데는 쓰지 않아요. 고르면 그 값이 앱 사용 통계에도 실려 토스로 가요.
          </p>
          <p className="privacy__text">
            확인 코드를 보낸 이메일 주소는 확인을 마치지 않았어도 남아요. 연결한 이메일을 앱 안에서
            떼어 낼 수는 없어요.
          </p>
          <p className="privacy__text">
            기록, 예산, 목표, 반복 지출, 태그, 분류, 기억한 분류는 지워도 화면에서만 사라지고,
            서버에는 지운 표시를 해 둔 채 남아요. 자산은 적어 둔 날마다 목록이 따로 남아서, 오늘 뺀
            항목도 지난날 목록에는 남아요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">직접 올린 금융 자료</h2>
          <p className="privacy__text">
            「캡처로 채우기」에 은행이나 증권 앱의 잔액 화면을 올리면, 그 사진에서 항목 이름과
            잔액만 읽어요. 자산 목록을 손으로 옮겨 적지 않게 하려는 것이에요. 사진은 저장하지 않고
            읽는 순간 사라져요. 읽는 일은 사진 읽기와 같이 <b>OpenAI</b>의 모델에 맡겨요.
          </p>
          <p className="privacy__text">
            읽은 이름과 금액은 「저장」을 눌렀을 때만 자산 목록에 들어가고, 그날 목록을 캡처로
            채웠다는 표시가 함께 남아요. 저장하지 않고 닫으면 아무것도 남지 않아요. 계좌번호는 읽지
            않고, 이름에 번호가 섞여 있으면 가린 뒤 보여 줘요. 캡처 읽기를 쓴 횟수는 사진 읽기와
            같이 남아요.
          </p>
          <p className="privacy__text">
            저장한 목록은 다른 자산과 같이 적은 날마다 남아요. 앱 데이터 초기화를 하면 화면에서
            사라지고, 서버에는 지운 표시를 해 둔 채 남아요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">투자 기록</h2>
          <ul className="privacy__list">
            <li className="privacy__item">저축·투자로 적은 기록이 어느 항목에 들어갔는지</li>
            <li className="privacy__item">넣었는지 팔았는지와 그 수량</li>
            <li className="privacy__item">종목마다 보유 수량, 넣은 돈, 판 기록의 받은 돈과 수익</li>
            <li className="privacy__item">
              직접 적었을 때만: 지금 1주 가격과 적은 날, 매달 넣는 돈
            </li>
          </ul>
          <p className="privacy__text">
            보유 수량과 수익률, 순자산 추이를 보여 드리려고 저장해요. 지금 가격은 밖에서 받아 오지
            않고 직접 적은 값만 써요. 증권 계좌번호나 증권사 계정은 묻지 않아요.
          </p>
          <p className="privacy__text">
            기록과 같아서 지워도 화면에서만 사라지고 서버에는 지운 표시를 해 둔 채 남아요. 앱 데이터
            초기화를 하면 함께 화면에서 사라져요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">같이 쓰는 가계부</h2>
          <ul className="privacy__list">
            <li className="privacy__item">가계부 이름과 종류, 돈을 나누는 방식</li>
            <li className="privacy__item">
              가계부를 만들 때나 초대받아 들어올 때 적는 내 이름. 적은 뒤에는 앱에서 바꿀 수 없어요
            </li>
            <li className="privacy__item">가계부에 적은 기록의 금액, 상호, 날짜, 분류</li>
            <li className="privacy__item">
              기록마다 누가 적고, 누가 냈고, 누가 고쳤는지와 그 시각
            </li>
            <li className="privacy__item">멤버마다 들어온 시각과 관리자인지</li>
            <li className="privacy__item">가계부의 예산과 분류, 정산을 끝낸 사람과 시각</li>
          </ul>
          <p className="privacy__text">
            이 값들은 서버에 저장되고, 그 가계부 멤버 모두 볼 수 있어요. 나중에 들어온 멤버도 지난
            기록까지 봐요. 들어온 시각처럼 화면에 나오지 않는 값도 멤버의 휴대폰에는 전해져요.
          </p>
          <p className="privacy__text">
            내 가계부의 기록과 예산, 분류 아이콘으로 고른 사진은 멤버에게 보이지 않아요. 내 기록을
            같이 쓰는 가계부로 직접 옮길 때만 그 한 건이 들어가요.
          </p>
          <p className="privacy__text">
            옮기면 상호와 메모도 함께 가요. 메모는 같이 쓰는 가계부 화면에 나오지 않지만, 서버에
            함께 저장되고 다른 멤버의 휴대폰도 기록을 받아 올 때 같이 받아요. 알리고 싶지 않은
            메모는 옮기기 전에 지워 주세요.
          </p>
          <p className="privacy__text">
            초대 링크는 받은 사람 누구나 쓸 수 있어요. 링크를 전달받은 사람도 7일 안에 이름만 적으면
            들어와 지난 기록까지 볼 수 있어요. 연인·부부 가계부는 한 사람이 들어오면 링크가 닫혀요.
            관리자가 아니어도 멤버 누구나 초대장을 보낼 수 있어요.
          </p>
          <p className="privacy__text">
            링크를 열면 들어오기 전에도 가계부 이름과 종류, 초대한 사람의 이름이 보여요. 7일이
            지나면 그 링크로 들어올 수 없고 가계부 이름도 안 보여요. 초대한 사람의 이름은 그 뒤에도
            보일 수 있어요.
          </p>
          <p className="privacy__text">
            가계부에서 나가거나 관리자가 나를 내보내도 내가 적은 기록은 가계부에 남고, 적은 사람은
            「나간 멤버」로 보여요. 나가 있는 동안에는 그 기록을 내가 지울 수 없어요. 혼자 남은
            가계부에서 나가면 가계부가 지워져요.
          </p>
          <p className="privacy__text">
            「가계부 지우기」를 하면 멤버 모두의 화면에서 가계부가 사라져요. 지운 직후 화면 아래에
            잠깐 뜨는 「되돌리기」를 누르면 되살릴 수 있어요.
          </p>
          <p className="privacy__text">
            나간 사람의 이름, 지운 가계부와 기록은 멤버 화면에서는 사라지지만 서버에서는 지우지 않고
            남겨 둬요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">저장하지 않는 것</h2>
          <ul className="privacy__list">
            <li className="privacy__item">
              카드번호와 계좌번호. 앱이 묻지 않고, 뒷자리도 따로 남기지 않아요
            </li>
            <li className="privacy__item">
              토스에 등록된 이름과 전화번호. 토스에서 받아 오지 않아요
            </li>
            <li className="privacy__item">캡처와 영수증 원본 이미지</li>
            <li className="privacy__item">읽어 달라고 보낸 글과 돌려받은 답의 원문</li>
          </ul>
          <p className="privacy__text">
            메모, 가계부 이름, 내 이름, 목표 이름처럼 직접 적는 칸은 가리지 않아요. 번호를 적으면
            적은 그대로 저장되고, 같이 쓰는 가계부에 적은 것은 멤버에게도 보여요.
          </p>
          <p className="privacy__text">앱 사용 통계에도 같은 것들을 남기지 않아요.</p>
          <p className="privacy__text">
            서버 기록(로그)에는 읽어 달라고 보낸 글과 사진을 적지 않아요. 다만 OpenAI가 오류를
            돌려주면 그 문구의 앞부분을 남기고, 여기에 보낸 글의 조각이 섞일 수 있어요. 읽어 온
            날짜나 금액이 이상해 보이면 그 값을 남겨요. 저장하다 오류가 나면 적은 값 일부가 섞일 수
            있어요.
          </p>
          <p className="privacy__text">
            서버 접속 기록에는 접속한 IP 주소와, 앱이 서버에 보낸 요청의 주소가 남아요. 월간 달력
            검색칸에 적은 말, 생활비 계산하기에 적은 금액, 초대 링크의 코드도 이 주소에 들어 있어
            함께 남아요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">밖으로 나가는 것</h2>
          <p className="privacy__text">
            사진과 줄글을 읽는 일은 저희가 직접 하지 못해서, <b>OpenAI</b>의 모델에 맡기고 있어요.
            그래서 읽어 달라고 보낼 때만 그 글과 사진이 <b>미국</b>에 있는 OpenAI 서버로 나가요.
          </p>
          <p className="privacy__text">
            그 글과 사진에 오늘 날짜와 분류 이름 목록이 함께 나가요. 같이 쓰는 가계부에 적을 때는 그
            가계부의 분류 이름이 대신 나가고, 다른 멤버가 만든 이름도 들어가요.
          </p>
          <p className="privacy__text">
            처음 읽은 결과가 맞지 않아 보이면, 같은 글이나 사진을 OpenAI의 다른 모델에 한 번 더 보낼
            때가 있어요. 이때 처음 결과에서 이상했던 날짜와 금액도 함께 나가요.
          </p>
          <p className="privacy__text">
            토스가 주는 이름 없는 사용자 번호(익명 식별키)나 이메일처럼 나를 가리키는 값은 함께
            보내지 않아요. 다만 글이나 사진 안에 이름이 적혀 있으면 그대로 나가요. 사진에 붙은 촬영
            위치 같은 정보는 대부분 떼고 보내지만, 다듬지 못했거나 손댈 필요가 없던 작은 사진은
            그대로 나갈 수 있어요.
          </p>
          <p className="privacy__text">
            보낸 것을 OpenAI가 나중에 다시 쓰도록 보관해 두는 기능은 꺼서 보내요. 다만 OpenAI는
            악용을 막으려고 정해진 기간 동안 보관할 수 있어요.
          </p>
          <p className="privacy__text">
            키패드만 쓰면 내가 OpenAI로 보내는 것은 없어요. 다만 같이 쓰는 가계부에 내가 만든 분류
            이름은, 다른 멤버가 그 가계부에 사진이나 줄글로 적을 때 함께 나가요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">그 밖에 맡기거나 나가는 곳</h2>
          <ul className="privacy__list">
            <li className="privacy__item">
              Google Cloud: 서버와 데이터베이스는 서울에 있고, 위에 적은 저장하는 것은 모두 여기에
              있어요. 서버 기록과 접속 기록은 지역을 정하지 않은 Google Cloud 기록 저장소에 30일
              동안 남아요. 데이터베이스 백업은 Google Cloud 아시아 지역에 14일치를 두고, 지운 것도
              그동안 백업에는 남아요
            </li>
            <li className="privacy__item">
              토스: 익명 식별키 확인, 앱 사용 통계, 광고, 기록 알림, 공유 링크 만들기
            </li>
            <li className="privacy__item">
              Google(Gmail): 「이메일로 지켜 두기」를 할 때 받는 주소와 확인 코드가 든 메일을
              보내요. 보낸 메일은 앱의 Gmail 보낸편지함에 남아요
            </li>
            <li className="privacy__item">공유창에서 고른 앱: 초대장이나 공유 문구</li>
            <li className="privacy__item">
              엑셀로 내보내기: 고른 기간의 기록이 상호와 메모까지 파일로 기기에 저장돼요. 그 파일은
              앱이 지키지 못해요
            </li>
            <li className="privacy__item">
              글꼴 파일을 나눠 주는 jsDelivr: 앱 글꼴을 받을 때 기기의 IP 주소
            </li>
          </ul>
          <p className="privacy__text">
            키패드만 써도 익명 식별키 확인과 앱 사용 통계는 토스로 가요.
          </p>
          <p className="privacy__text">
            앱 사용 통계에는 무엇을 눌렀는지와 몇 건인지 같은 값을 실어요. 상호, 금액, 메모, 이름,
            가계부 이름은 싣지 않아요. 연령대와 성별을 골랐으면 그 값, 같이 쓰는 가계부의 종류와
            인원이 몇 명쯤인지, 앱을 처음과 마지막으로 연 지 며칠인지도 실려요.
          </p>
          <p className="privacy__text">기록 알림에는 기록 내용이나 금액을 싣지 않아요.</p>
          <p className="privacy__text">
            초대장에는 내 이름과 가계부 이름, 누르면 초대 화면이 열리는 링크가 들어가요. 목표를
            공유하면 목표 이름과 모은 비율이, 결산을 공유하면 그 달을 예산 안에서 마쳤는지가
            들어가요. 어느 문구에도 금액은 넣지 않아요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">읽어 달라고 보내기 전</h2>
          <p className="privacy__text">
            「줄글」에 적어 읽어 달라고 보낸 글은 카드번호, 계좌번호, 전화번호처럼 긴 번호를 가린
            뒤에 보내요. 돌려받은 상호명에 번호가 섞여 있으면 그것도 가려서 저장해요.
          </p>
          <p className="privacy__text">
            열 자리보다 짧은 번호는 가리지 않아요. 띄어 쓰거나 점으로 끊어 적은 번호도 못 가릴 때가
            있어요. 글 속의 사람 이름은 가리지 않아요.
          </p>
          <p className="privacy__text">
            사진은 찍혀 있는 글자를 가릴 수 없어요. 카드번호나 잔액이 보이는 사진은 그 부분을 가리고
            올려 주세요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">누구인지 아는 방법</h2>
          <p className="privacy__text">
            따로 가입하지 않아도 돼요. 토스가 이 앱에만 주는, 이름 없는 사용자 번호(익명 식별키)로
            사용자를 갈라요. 토스에 등록된 이름이나 전화번호는 받아 오지 않아요.
          </p>
          <p className="privacy__text">
            이 번호가 맞는지는 토스에 물어 확인하고, 서버에는 되돌릴 수 없게 바꿔서 저장해요. 기록
            알림을 켜면 알림을 보내려고 바꾸기 전의 번호도 따로 둬요.
          </p>
          <p className="privacy__text">
            이 번호는 토스 안의 앱마다 다르게 만들어져요. 그래서 이 번호만으로는 이 앱 밖에서 같은
            사람인지 알아볼 수 없어요.
          </p>
          <p className="privacy__text">
            「이메일로 지켜 두기」를 쓰면 이메일과 여섯 자리 확인 코드로도 나를 알아봐요. 다른
            기기에서 같은 이메일로 확인하면 그 기기도 같은 사람으로 이어요. 이메일은 이 앱 밖에서도
            쓰는 값이라, 연결하면 이 앱의 기록이 그 주소와 이어져요.
          </p>
        </Card>

        <Card>
          <h2 className="privacy__title">앱 데이터 초기화를 해도 남는 것</h2>
          <ul className="privacy__list">
            <li className="privacy__item">태그와 반복 지출</li>
            <li className="privacy__item">같이 쓰는 가계부와 그 안의 내 이름, 내가 적은 기록</li>
            <li className="privacy__item">이메일 주소, 확인 코드를 보낸 기록, 이어 둔 기기</li>
            <li className="privacy__item">연령대와 성별</li>
          </ul>
          <p className="privacy__text">
            「앱 데이터 초기화」를 하면 기록, 예산, 목표, 자산, 투자 기록, 내가 만든 분류, 기억한
            분류가 화면에서 사라져요. 잘못 눌렀을 때를 위해 서버에서는 지운 표시만 해 둬요. 읽어 온
            뒤 저장하지 않은 목록, 읽기를 쓴 횟수, 앱 설정, 알림 설정은 그때 바로 지워요.
          </p>
          <p className="privacy__text">
            지운 표시만 해 둔 것을 나중에 완전히 없애는 작업은 지금 없어요. 앱 안에는 계정을 통째로
            없애는 기능도 없어요.
          </p>
        </Card>
      </div>
    </div>
  );
}
