/**
 * 찍어 둔 앱 화면을 스토어 스크린샷 판형에 얹는다.
 *
 * ```
 * # 1. 앱 화면을 찍는다
 * POCKET_SHOT_OUT=<폴더> npx playwright test specs/promo-shots.spec.ts --project=mobile-chromium
 * # 2. 쓸 만큼만 잘라 <폴더>/crops 에 넣는다 (어디를 자를지는 눈으로 보고 정한다)
 * # 3. 얹는다 (결과는 콘솔 규격 636x1048)
 * POCKET_SHOT_DIR=<폴더> node scripts/store-shots.mjs
 * ```
 *
 * 판은 셋이다. 1번과 3번 앞에 `POCKET_SHOT_SET=<판>` 을 붙인다.
 * 비우거나 `basic` 이면 기본 판(캡처, 글, 도넛, 분류, 엑셀, 태그), `shared` 는 같이 쓰는 가계부,
 * `assets` 는 내 자산 판이다. 결과 이름은 `<판>-<번호>-<제목 앞말>.png` 다.
 * 결과 폴더를 바꾸려면 `POCKET_STORE_OUT=<폴더>` 를 준다. 없으면 `<폴더>/store`.
 *
 * **자르는 일은 여기서 안 한다.** 어느 카드까지 담을지는 그때그때 화면을 보고 정하는
 * 판단이라, 숫자로 박아 두면 다음 판에서 반드시 어긋난다. 자른 결과의 이름만 약속한다.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 찍은 화면과 잘라 둔 그림이 있는 폴더. 결과도 그 아래 `store/` 에 놓는다. */
const DIR = process.env.POCKET_SHOT_DIR;
if (DIR == null) throw new Error('POCKET_SHOT_DIR 을 주세요. 자른 그림이 있는 폴더입니다.');

const CROPS = resolve(DIR, 'crops');
const OUT = process.env.POCKET_STORE_OUT ?? resolve(DIR, 'store');

const uri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const crop = (name) => uri(readFileSync(`${CROPS}/${name}.png`));

/** 어느 판을 만드나. 비우면 기본 판이다. */
const SET = process.env.POCKET_SHOT_SET || 'basic';

const logo = uri(readFileSync(resolve(HERE, '../public/icons/app-logo-192.png')));

/*
  기본 판 여섯 장. 2026-10-07 에 지금 화면으로 다시 찍었다. 첫 장(캡처)도 이제 이 길로 만든다.

  `crops/` 에 있어야 하는 이름이 여기 적힌 것들이다. 폰 목업은 높이를 그림에 맡기므로
  (`store-frame.html` 의 `.phone`) 세로 비율을 맞출 필요는 없다. 가로는 1082 로 맞춘다.
  제목과 부제의 말은 화면에 적힌 이름(글로 쓰기, 새 분류 만들기)을 따른다.
*/
const BASIC_PAGES = [
  {
    file: '1-캡처 한 장이면.png',
    title: '캡처 한 장이면|며칠치가 끝나요',
    sub: '카드 문자도 결제 내역도, 캡처해서 올리기만 하면 돼요',
    shot: 'one-capture',
  },
  {
    file: '2-글로 쓰면.png',
    title: '글로 쓰면|날짜까지 알아서',
    sub: '「어제 김밥천국 8000원」 이라고 쓰면 어제 칸에 들어가요',
    shot: 'one-nl',
  },
  {
    file: '3-어디에 썼는지.png',
    title: '어디에 썼는지|한눈에 보여요',
    sub: '분류별로 얼마를 썼는지 동그라미 하나로 보여줘요',
    shot: 'one-donut',
  },
  {
    file: '4-나만의 분류를.png',
    title: '나만의|분류를 만들어요',
    sub: '이름만 적으면 돼요. 그림은 고르고 싶을 때만 골라요',
    shot: 'one-category',
  },
  {
    file: '5-내 기록을 엑셀로.png',
    title: '내 기록을|엑셀 파일로 받아요',
    sub: '월별 요약과 카테고리별 요약까지 한 파일에 담아 줘요',
    shot: 'one-export',
  },
  {
    file: '6-태그로 따로.png',
    title: '태그로 따로|모아서 봐요',
    sub: '카테고리와 별개로 통계를 볼 수 있어요',
    layout: 'two',
    front: 'two-tags',
    back: 'two-report-tags',
    tagFront: '태그 만들기',
    tagBack: '리포트',
  },
];

/*
  같이 쓰는 가계부 판 세 장. 부제에 송금처럼 읽히는 말을 쓰지 않는다. 앱은 나눈 금액만 보여 준다.
  `crops/` 에 book-home, book-settle, book-join 이 있어야 한다.
*/
const SHARED_PAGES = [
  {
    file: '1-공유 가계부로.png',
    title: '공유 가계부로|둘이 같이 적어요',
    sub: '각자 적은 기록이 한곳에 모이고 누가 적었는지 보여요',
    shot: 'book-home',
  },
  {
    file: '2-나눌 돈은.png',
    title: '나눌 돈은|알아서 계산해요',
    sub: '둘이면 반반, 여럿이면 인원수대로 나눠 보여줘요',
    shot: 'book-settle',
  },
  {
    file: '3-링크 하나로.png',
    title: '링크 하나로|같이 써요',
    sub: '받은 사람은 가입 없이 이름만 적으면 돼요',
    shot: 'book-join',
  },
];

/*
  내 자산 판 다섯 장(2026-10-07). 계좌 연결, 자동 연동, 투자 권유로 읽히는 말을 쓰지 않는다.
  수익률은 넣은 돈을 아는 종목만 뜬다. 앞 카드가 긴 두 장 판은 `frontTop` 으로 내린다.
*/
const ASSET_PAGES = [
  {
    file: '1-예금, 적금, 투자를.png',
    title: '예금, 적금, 투자를|한 화면에 모아요',
    sub: '넣은 돈을 아는 종목은 수익률까지 보여줘요',
    shot: 'asset-groups',
  },
  {
    file: '2-은행, 증권 앱 캡처로.png',
    title: '은행, 증권 앱 캡처로|자산을 채워요',
    sub: '잔액과 종목을 읽어 와요. 고른 것만 넣어요',
    shot: 'asset-capture',
  },
  {
    file: '3-내 자산이 어디에.png',
    title: '내 자산이 어디에|얼마나 있는지',
    sub: '종류별 비중과 큰 저축·투자 Top 5 를 보여줘요',
    layout: 'two',
    back: 'asset-donut',
    front: 'asset-top5',
    tagBack: '내 자산 리포트',
    frontTop: 660,
  },
  {
    file: '4-적금에 넣은 돈도.png',
    title: '적금에 넣은 돈도|10초면 적어요',
    sub: '넣은 곳을 고르고 금액만 치면 내 자산에 더해져요',
    layout: 'two',
    back: 'save-keypad',
    front: 'save-done',
    tagBack: '기록하기',
    tagFront: '저장 뒤',
    frontTop: 600,
  },
  {
    file: '5-월급날부터.png',
    title: '월급날부터|한 달로 봐요',
    sub: '25일로 두면 리포트와 예산이 9.25 ~ 10.24 로 맞춰져요',
    layout: 'two',
    back: 'month-sheet',
    front: 'month-report',
    tagBack: '한 달 시작일',
    tagFront: '리포트',
    frontTop: 600,
  },
];

const SETS = { basic: BASIC_PAGES, shared: SHARED_PAGES, assets: ASSET_PAGES };

const LIST = SETS[SET];
if (LIST == null) throw new Error(`POCKET_SHOT_SET 은 basic, shared, assets 중 하나예요: ${SET}`);

mkdirSync(OUT, { recursive: true });

/*
  **콘솔이 636x1048 만 받는다.** 「이미지 크기가 맞지 않아요」 로 거부한다.

  그래도 2배로 그린다. 1배로 그리면 글자가 뭉개진다. 찍은 뒤 절반으로 줄이면 2배 표본을
  모아 만든 636x1048 이 되어 오히려 더 깨끗하다. 줄이는 일은 `sharp` 없이
  캔버스로 한다(`drawImage` 가 브라우저의 좋은 보간을 쓴다).
*/
const OUT_WIDTH = 636;
const OUT_HEIGHT = 1048;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: OUT_WIDTH, height: OUT_HEIGHT },
  deviceScaleFactor: 2,
});

/** 2배로 찍은 그림을 콘솔 규격으로 줄인다. */
const shrinker = await browser.newPage({ viewport: { width: OUT_WIDTH, height: OUT_HEIGHT } });
async function toConsoleSize(buffer) {
  const base64 = buffer.toString('base64');
  const shrunk = await shrinker.evaluate(
    async ([data, w, h]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, w, h);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    [base64, OUT_WIDTH, OUT_HEIGHT],
  );
  return Buffer.from(shrunk, 'base64');
}

for (const item of LIST) {
  const params = new URLSearchParams({
    layout: item.layout ?? 'one',
    title: item.title,
    sub: item.sub,
    logo,
  });
  if (item.layout === 'two') {
    params.set('shotFront', crop(item.front));
    params.set('shotBack', crop(item.back));
    params.set('tagFront', item.tagFront ?? '');
    params.set('tagBack', item.tagBack ?? '');
    if (item.backTop != null) params.set('backTop', String(item.backTop));
    if (item.frontTop != null) params.set('frontTop', String(item.frontTop));
  } else {
    params.set('shot', crop(item.shot));
  }

  await page.goto(`file://${resolve(HERE, 'store-frame.html')}?${params.toString()}`);
  await page.waitForTimeout(700);
  const shot = await page.screenshot();
  const name = `${SET}-${item.file}`;
  writeFileSync(`${OUT}/${name}`, await toConsoleSize(shot));
  console.log('만들었다:', name);
}

await browser.close();
