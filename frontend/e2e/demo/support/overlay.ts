/**
 * 녹화 영상 위에 얹는 것들.
 *
 * 영상에는 마우스 커서가 찍히지 않는다. 무엇을 눌렀는지 안 보이면 "동작하는 모습" 이 아니라
 * 화면이 저절로 바뀌는 것처럼 보인다. 그래서 누른 자리에 물결을 그리고, 지금 무슨 단계인지
 * 위쪽에 한 줄로 적는다.
 *
 * 제품 코드는 건드리지 않는다. 전부 addInitScript 로 바깥에서 얹는다.
 * 오버레이가 클릭을 가로채면 녹화 자체가 망가지므로 pointer-events 는 전부 none 이다.
 */

/** 브라우저 안에서 도는 함수. 바깥 스코프를 참조하면 안 된다. */
export function installDemoOverlay(): void {
  const CSS = `
    /* devtools 가 띄우는 파란 AIT 버튼. 제품 화면이 아니라 개발 도구라 영상에서 걷어낸다.
       목 SDK 자체는 그대로 돌고 버튼만 안 보인다. */
    .ait-panel-root { display: none !important; }
    .pdemo-layer { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
    .pdemo-ripple {
      position: fixed; width: 64px; height: 64px; margin: -32px 0 0 -32px;
      border-radius: 50%; pointer-events: none; z-index: 2147483001;
      background: radial-gradient(circle, rgba(49,130,246,.45) 0%, rgba(49,130,246,.18) 55%, rgba(49,130,246,0) 70%);
      border: 2px solid rgba(49,130,246,.85);
      animation: pdemo-pop .55s ease-out forwards;
    }
    @keyframes pdemo-pop {
      0%   { transform: scale(.35); opacity: 1; }
      100% { transform: scale(1.25); opacity: 0; }
    }
    .pdemo-step {
      position: fixed; left: 12px; right: 12px; top: 12px; z-index: 2147483002;
      pointer-events: none; box-sizing: border-box;
      padding: 10px 14px; border-radius: 12px;
      background: rgba(23,26,31,.86); color: #fff;
      font: 600 14px/1.45 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
      letter-spacing: -.2px; text-align: center;
      box-shadow: 0 6px 20px rgba(0,0,0,.25);
      opacity: 0; transform: translateY(-8px); transition: opacity .25s ease, transform .25s ease;
    }
    .pdemo-step[data-on="1"] { opacity: 1; transform: translateY(0); }
    /* 자막은 화면 위에 떠 있다. 그만큼 본문을 밀어야 히어로 라벨이 가려지지 않는다. */
    body { transition: padding-top .22s ease; }
    .pdemo-title {
      position: fixed; inset: 0; z-index: 2147483003; pointer-events: none;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 10px; padding: 32px; text-align: center;
      background: linear-gradient(160deg, #1B64DA 0%, #3182F6 100%); color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
      opacity: 1; transition: opacity .45s ease;
    }
    .pdemo-title[data-off="1"] { opacity: 0; }
    .pdemo-title__eyebrow { font-size: 13px; font-weight: 600; opacity: .78; letter-spacing: .4px; }
    .pdemo-title__main { font-size: 27px; font-weight: 800; line-height: 1.35; letter-spacing: -.6px; }
    .pdemo-title__sub { font-size: 15px; font-weight: 500; opacity: .9; line-height: 1.5; max-width: 22em; }
  `;

  /**
   * 제목 카드를 이미 보여줬다는 표시.
   *
   * 이 스크립트는 문서마다 새로 돈다. 한 장면 안에서 화면을 다시 여는 것은 흔한데,
   * 그때마다 덮개를 다시 깔면 화면이 파랗게 덮인 채로 남는다. 걷어 주는 사람이 없기 때문이다.
   * 탭이 유지되는 동안 남는 저장소에 표시를 남겨, 덮개는 영상 맨 앞에서 한 번만 깐다.
   */
  const TITLE_DONE = 'pdemo-title-done';

  const w = window as unknown as Record<string, unknown>;
  if (w.__pocketDemoOverlay === true) return;
  w.__pocketDemoOverlay = true;

  function titleAlreadyShown(): boolean {
    try {
      return sessionStorage.getItem(TITLE_DONE) === '1';
    } catch {
      // 저장소를 못 읽는 환경이면 덮개를 안 깐다. 파랗게 남는 것보다 낫다.
      return true;
    }
  }

  function markTitleShown(): void {
    try {
      sessionStorage.setItem(TITLE_DONE, '1');
    } catch {
      // 못 적어도 그냥 넘어간다. 다음 문서에서 덮개가 한 번 더 깔릴 뿐이다.
    }
  }

  function ensureStyle(): void {
    if (document.getElementById('pdemo-style')) return;
    const style = document.createElement('style');
    style.id = 'pdemo-style';
    style.textContent = CSS;
    // 문서가 막 시작된 시점이라 head 가 아직 없을 수 있다. 그때는 문서 뿌리에 건다.
    const root = document.head ?? document.documentElement;
    if (root == null) return;
    root.appendChild(style);
  }

  /**
   * 화면을 덮는 카드를 만든다. 이미 있으면 그것을 준다.
   *
   * 앱이 뜨기 전부터 덮고 있어야 한다. 늦게 덮으면 흰 화면과 로딩 스피너,
   * devtools 의 파란 버튼이 영상 앞머리에 그대로 남는다.
   */
  function ensureCover(): HTMLElement | null {
    const found = document.querySelector<HTMLElement>('.pdemo-title');
    if (found) return found;

    const root = host();
    if (root == null) return null;

    const card = document.createElement('div');
    card.className = 'pdemo-title';
    card.innerHTML =
      '<div class="pdemo-title__eyebrow">10초 가계부</div>' +
      '<div class="pdemo-title__main"></div>' +
      '<div class="pdemo-title__sub"></div>';
    root.appendChild(card);
    return card;
  }

  function host(): HTMLElement | null {
    return document.body ?? document.documentElement ?? null;
  }

  // 누른 자리에 물결을 그린다. capture 로 잡아 앱이 이벤트를 멈춰도 표시는 남는다.
  document.addEventListener(
    'pointerdown',
    (event) => {
      const body = host();
      if (!body) return;
      ensureStyle();
      const dot = document.createElement('div');
      dot.className = 'pdemo-ripple';
      dot.style.left = `${(event as PointerEvent).clientX}px`;
      dot.style.top = `${(event as PointerEvent).clientY}px`;
      body.appendChild(dot);
      window.setTimeout(() => dot.remove(), 600);
    },
    true,
  );

  /** 지금 무슨 단계인지 위쪽에 한 줄. 빈 문자열이면 감춘다. */
  w.__pocketDemoStep = (text: string): void => {
    const body = host();
    if (!body) return;
    ensureStyle();
    let bar = document.querySelector<HTMLElement>('.pdemo-step');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'pdemo-step';
      body.appendChild(bar);
    }
    if (text) {
      bar.textContent = text;
      bar.dataset.on = '1';
      if (document.body) document.body.style.paddingTop = `${bar.offsetHeight + 22}px`;
    } else {
      bar.dataset.on = '0';
      if (document.body) document.body.style.paddingTop = '';
    }
  };

  /**
   * 영상 맨 앞의 제목 카드.
   *
   * 카드는 문서가 시작될 때 이미 깔려 있다. 여기서는 글자만 채운다.
   * 다시 만들면 그 순간 앱 화면이 한 번 드러나 부팅 구간이 영상에 남는다.
   */
  w.__pocketDemoTitle = (eyebrow: string, main: string, sub: string): void => {
    const card = ensureCover();
    if (card == null) return;
    (card.querySelector('.pdemo-title__eyebrow') as HTMLElement).textContent = eyebrow;
    (card.querySelector('.pdemo-title__main') as HTMLElement).textContent = main;
    (card.querySelector('.pdemo-title__sub') as HTMLElement).textContent = sub;
  };

  /** 제목 카드를 걷어낸다. 페이드가 끝난 뒤 지운다. */
  w.__pocketDemoTitleOff = (): void => {
    markTitleShown();
    const card = document.querySelector<HTMLElement>('.pdemo-title');
    if (!card) return;
    card.dataset.off = '1';
    window.setTimeout(() => card.remove(), 600);
  };

  /**
   * 스타일과 덮개를 건다.
   *
   * 이 스크립트는 문서가 만들어지기 전에 돈다. 그 시점에는 `document.documentElement` 조차 없어
   * 바로 붙일 수 없다. 뿌리가 생기는 즉시 붙여야 앱이 뜨는 흰 화면이 영상에 남지 않는다.
   */
  function attachWhenRootExists(): void {
    if (ensureCoverAndStyle()) return;
    const timer = setInterval(() => {
      if (ensureCoverAndStyle()) clearInterval(timer);
    }, 0);
  }

  function ensureCoverAndStyle(): boolean {
    if (host() == null) return false;
    // 스타일은 문서마다 걸어야 한다. devtools 버튼을 감추는 것이 여기 들어 있다.
    ensureStyle();
    if (titleAlreadyShown()) return true;
    return ensureCover() != null;
  }

  attachWhenRootExists();
}

