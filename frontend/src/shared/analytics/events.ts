/**
 * 행동 로그의 이름과 값.
 *
 * 알고 싶은 것은 "무엇을 적었나" 가 아니라 **"어디서 얼마나 고생했나"** 다.
 * 이 앱은 빨리 적고 닫아도 성공이라, 체류 시간이나 화면 수를 늘리는 지표를 만들지 않는다.
 *
 * **여기 없는 것은 안 보낸다.** 상호·메모·줄글 원문·OCR 결과·금액·계좌/카드번호·이미지·
 * 인증 헤더·API 본문은 어느 이벤트에도 실리지 않는다. 값은 갯수와 갈래 이름까지다.
 * 「5건 중 날짜 2건·금액 1건 고침」 은 남기고, 그 날짜와 금액은 남기지 않는다.
 */

export const EVENTS = {
  /** 앱을 열었다. 세션당 한 번. */
  appOpen: 'app_open',
  /** 화면에 들어왔다. */
  screenView: 'screen_view',

  /** 기록 시트를 열었다. 여기서 flow 가 시작된다. */
  recordStarted: 'record_started',
  /** 시트 안에서 방식을 옮겼다(키패드·줄글·캡처·영수증). */
  inputMethodChanged: 'input_method_changed',

  /** 앨범·카메라를 열어 본 결과. 성공·취소·권한 거절. */
  imagePickResult: 'image_pick_result',

  /** 읽기를 시작했다. */
  parseStarted: 'parse_started',
  /** 읽기가 끝났다. 몇 초 걸렸고 몇 건을 찾았는지. */
  parseFinished: 'parse_finished',

  /** 검토 목록을 보여 줬다. */
  reviewShown: 'review_shown',
  /** 검토를 끝냈다. 무엇을 몇 건 고쳤는지 필드 이름까지만. */
  reviewFinished: 'review_finished',
  /**
   * 읽어 온 것을 저장하지 않고 「취소」로 스스로 버렸다.
   *
   * 닫으려다 잃을 뻔한 것(`record_leave_asked`)과 갈라 센다. 이건 눌러서 그만둔 것이다.
   */
  reviewCancelled: 'review_cancelled',
  /**
   * 읽어 온 것을 두고 시트를 닫으려 해서 한 번 물었다. 그리고 무엇을 골랐나.
   *
   * **이 로그가 이번 확인 창의 유일한 성적표다.** 물었을 때 「계속 고치기」를 고른 비율이
   * 곧 이 창이 구해 낸 기록이다. 그 비율이 높으면 그만큼 실수로 날아가고 있었다는 뜻이고,
   * 낮으면 사람들이 정말로 닫으려던 것이라 창이 방해만 한 것이다.
   */
  recordLeaveAsked: 'record_leave_asked',

  /** 저장 버튼을 눌렀다. */
  saveRequested: 'save_requested',
  /** 저장이 실제로 끝났다. **DB 에 들어간 건수를 서버가 답한 뒤에만 성공으로 적는다.** */
  saveResult: 'save_result',

  /** 저장한 뒤에 고치거나 지우거나 되돌렸다. */
  recordChanged: 'record_changed',

  /** 저장 직후 피드백을 보여 줬다. */
  feedbackShown: 'feedback_shown',
  /** 그 피드백에서 무엇을 눌렀나. */
  feedbackAction: 'feedback_action',

  /** 예산을 저장했다. 처음인지 아닌지. */
  budgetSaved: 'budget_saved',
  /**
   * 생활비 계산기를 열었다. 광고를 보고 열었나, 광고 없이 지나갔나.
   *
   * 광고가 안 떠서 그냥 연 비율이 높으면 광고 자리 사정이지 사람 탓이 아니다.
   * 광고를 본 사람 중 예산까지 정한 비율(`budget_saved` 의 `from: 'calculator'`)이
   * 이 부가기능이 5초를 받을 값어치가 있는지 말해 준다.
   */
  budgetCalcOpened: 'budget_calc_opened',
  /**
   * 다 모은 목표를 마쳤다.
   *
   * 이 앱에서 사람이 끝까지 해낸 유일한 일이다. 다 모으고도 안 마친 사람이 많으면
   * 축하 화면이 안 읽히는 것이고, 마친 뒤 새 목표를 안 정하면 거기서 관계가 끝난 것이다.
   */
  goalFinished: 'goal_finished',
  /** 홈 화면에 추가하라는 안내의 결과. 실제 추가 여부는 앱이 알 수 없다. */
  homeAddResult: 'home_add_result',
  /**
   * 이메일 연결의 한 걸음. 코드를 보냈나, 붙었나, 다른 기기로 옮겨 갔나, 어디서 막혔나.
   *
   * 로그인 화면이 사람을 내보내는 자리가 되면 안 된다. `sent` 대비 `linked`·`switched`·
   * `merged` 의 비율이 곧 이 흐름의 성적표다. 이메일 주소·코드는 싣지 않는다.
   */
  accountLinkResult: 'account_link_result',
  /** 연령대·성별을 답했나 건너뛰었나. 답했으면 그 갈래까지. 분석용 표본이 얼마나 되나. */
  profileResult: 'profile_result',
  /**
   * 처음 안내를 끝냈나 건너뛰었나, 그리고 어느 장에서.
   *
   * 이 앱은 배우기 싫은 사람을 위한 것이라 **안내가 길면 그 자체로 실패다.**
   * 첫 장에서 건너뛰는 사람이 많으면 장 수가 아니라 첫 장이 잘못된 것이고,
   * 끝까지 본 사람의 첫 기록 성공률이 건너뛴 사람보다 낮으면 안내가 방해가 된 것이다.
   */
  onboardingResult: 'onboarding_result',
  /** 알림을 켜려 했을 때의 결과. 이 앱이 사람을 다시 데려오는 유일한 장치다. */
  notificationResult: 'notification_result',

  /** 분류 「더 보기」를 폈다. 앞자리 열한 개로 모자란 사람이 얼마나 되는지 본다. */
  categoryMoreOpened: 'category_more_opened',
  /** 칩 순서를 바꿨다. 어떻게 바꿨는지(한 칸 옮기기·자주 쓴 순서)만 남긴다. */
  categoryOrderChanged: 'category_order_changed',

  /**
   * 앱 데이터를 지웠다.
   *
   * 되돌릴 수 없는 자리라 **누른 것과 실제로 지워진 것을 따로 센다.** 확인 창을 열고
   * 그만둔 사람이 많으면 경고가 아니라 문구가 무서운 것이다.
   */
  dataResetResult: 'data_reset_result',

  /**
   * 안 쓴 날로 표시했다.
   *
   * 빈 날 카드에 남은 **유일한 한 줄**이라, 이게 안 눌리면 그 카드는 아무 일도 안 하는
   * 자리다. 기록하기 버튼과 함께 세어야 빈 날에 사람들이 무엇을 고르는지 갈린다.
   */
  noSpendMarked: 'no_spend_marked',

  /**
   * 친구에게 공유하기를 눌렀고 그 결과가 어떻게 됐나.
   *
   * 자리(`where`)와 갈래(`kind`)와 결과(`result`)까지만 남긴다. **공유 문구는 싣지 않는다.**
   * 문구에는 목표 이름과 진행률이 들어가 있어, 그대로 실으면 이 앱이 절대 안 보내기로 한
   * 값을 로그로 내보내는 것이 된다. 문구 확인은 개발 판의 `window.__pocketShares` 가 한다.
   *
   * 자리마다 누른 비율이 갈리면 그 자리가 잘못 놓인 것이다. 홈 카드처럼 스스로 나타나는
   * 자리는 닫은 수(`share_card_dismissed`)와 함께 봐야 성가신지 아닌지가 갈린다.
   */
  shareResult: 'share_result',
  /** 홈의 공유 권유 카드를 닫았다. 권유가 성가신지 보는 유일한 값이다. */
  shareCardDismissed: 'share_card_dismissed',

  /**
   * 「곧 나갈 돈」 카드에서 무엇을 눌렀나.
   *
   * 적은 수(`recorded`)와 미룬 수(`dismissed`)를 함께 봐야 이 카드가 도움인지 성가신지
   * 갈린다. 전날(`eve`)과 당일(`today`) 중 언제 누르는지도 함께 남긴다. 전날에 아무도
   * 안 누르면 하루 먼저 띄울 이유가 없다.
   *
   * **항목 이름과 금액은 싣지 않는다.** 그 사람이 무엇을 구독하는지가 로그에 남는다.
   */
  recurringResult: 'recurring_result',

  /** 배너 자리의 결과. 떴는지·채울 게 없었는지·실패했는지. */
  adResult: 'ad_result',
  /**
   * 전면 광고를 지나온 결과. 어느 자리(`where`)에서, 봤나 지나갔나, 지나갔으면 왜인가.
   *
   * **자리마다 따로 봐야 한다.** 전면 광고는 사람을 멈춰 세우는 장치라, 한 자리가
   * 성가시면 앱 전체가 성가신 것으로 기억된다. 그 자리에서 하려던 일을 끝낸 비율이
   * 광고 없이 지나간 사람보다 눈에 띄게 낮으면 그 자리는 잘못 놓인 것이다.
   *
   * `capped` 는 상한에 걸려 아예 안 부른 것이다. 이 값이 많으면 자리를 더 늘릴 것이
   * 아니라 상한을 다시 볼 때다.
   */
  interstitialResult: 'interstitial_result',
  /** 화면이 죽었거나 요청이 실패했다. */
  clientError: 'client_error',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** 기록 방식. 시트 탭 이름과 같은 값을 쓴다. */
export type LogMethod = 'keypad' | 'text' | 'capture' | 'receipt';

/** 사진을 고른 결과. */
export type PickOutcome = 'ok' | 'cancelled' | 'denied' | 'unsupported' | 'failed';

/** 읽기 결과. 부분 성공은 상한을 넘겨 일부를 버린 경우다. */
export type ParseOutcome = 'ok' | 'partial' | 'empty' | 'failed';

/** 고칠 수 있는 자리. 값이 아니라 어느 칸인지만 센다. */
export type EditField =
  'amount' | 'date' | 'category' | 'type' | 'merchant' | 'payment_method' | 'selection';
