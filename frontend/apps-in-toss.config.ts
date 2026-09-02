import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'pocket',
  brand: {
    // 세이지 700. 디자인 토큰의 primary 와 같은 값을 쓴다.
    primaryColor: '#3F5A40',
  },
  permissions: [
    // 앨범에서 결제 알림·계좌 캡처를 고른다.
    { name: 'photos', access: 'read' },
    // 영수증을 바로 찍는다.
    { name: 'camera', access: 'access' },
  ],
  navigationBar: {
    // 상단바는 플랫폼이 그린다. 하위 화면에서 쓰는 뒤로가기와 제목만 켠다.
    withBackButton: true,
    withTitle: true,
    withHomeButton: false,
    theme: 'light',
  },
  webView: {
    // 당겨서 새로고침하면 SPA 가 통째로 다시 뜬다.
    pullToRefreshEnabled: false,
    // 스와이프 뒤로가기는 우리 뒤로가기 처리를 건너뛴다.
    allowsBackForwardNavigationGestures: false,
  },
  webBundleDir: 'dist',
});
