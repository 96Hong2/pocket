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
const OUT = resolve(DIR, 'store');

const uri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const crop = (name) => uri(readFileSync(`${CROPS}/${name}.png`));

const logo = uri(readFileSync(resolve(HERE, '../public/icons/app-logo-192.png')));

/*
  여섯 장 중 다섯 장. 첫 장(캡처)은 2026-09 판을 그대로 쓴다.

  `crops/` 에 있어야 하는 이름이 여기 적힌 것들이다. 폰 목업은 높이를 그림에 맡기므로
  (`store-frame.html` 의 `.phone`) 세로 비율을 맞출 필요는 없다. 가로는 1082 로 맞춘다.
*/
const PAGES = [
  {
    file: 'promo-2-줄글로 적으면.png',
    title: '줄글로 적으면|날짜까지 알아서',
    sub: '「어제 김밥천국 8000원」 이라고 쓰면 어제 칸에 들어가요',
    shot: 'one-nl',
  },
  {
    file: 'promo-3-어디에 썼는지.png',
    title: '어디에 썼는지|한눈에 보여요',
    sub: '카테고리별로 얼마를 썼는지 동그라미 하나로 보여줘요',
    shot: 'one-donut',
  },
  {
    file: 'promo-4-나만의 카테고리.png',
    title: '나만의|카테고리를 만들어요',
    sub: '이름만 적으면 끝이에요. 그림과 색은 고르고 싶을 때만 골라요',
    shot: 'one-category',
  },
  {
    file: 'promo-5-내 기록을 엑셀로.png',
    title: '내 기록을|엑셀 파일로 받아요',
    sub: '월별 요약과 카테고리별 요약까지 한 파일에 담아 줘요',
    shot: 'one-export',
  },
  {
    file: 'promo-6-태그로 따로 모아서.png',
    title: '태그로 따로|모아서 봐요',
    sub: '카테고리와 별개로 통계를 볼 수 있어요',
    layout: 'two',
    front: 'two-tags',
    back: 'two-report-tags',
    tagFront: '태그 만들기',
    tagBack: '리포트',
  },
];

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

for (const item of PAGES) {
  const params = new URLSearchParams({
    layout: item.layout ?? 'one',
    title: item.title,
    sub: item.sub,
    logo,
  });
  if (item.layout === 'two') {
    params.set('shotFront', crop(item.front));
    params.set('shotBack', crop(item.back));
    params.set('tagFront', item.tagFront);
    params.set('tagBack', item.tagBack);
  } else {
    params.set('shot', crop(item.shot));
  }

  await page.goto(`file://${resolve(HERE, 'store-frame.html')}?${params.toString()}`);
  await page.waitForTimeout(700);
  const shot = await page.screenshot();
  writeFileSync(`${OUT}/${item.file}`, await toConsoleSize(shot));
  console.log('만들었다:', item.file);
}

await browser.close();
