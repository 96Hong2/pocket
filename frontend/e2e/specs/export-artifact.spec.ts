import { writeFileSync } from 'node:fs';

import { readSavedFiles } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 내려받은 파일을 **디스크에 꺼내 두는** 한 판.
 *
 * `ledger-export.spec.ts` 가 내용이 맞는지 지키고, 여기는 사람이 엑셀로 열어서 눈으로
 * 볼 수 있게 실물을 남긴다. base64 만 단언하고 끝내면 「엑셀이 이 파일을 열기는 하나」 에
 * 아무도 답하지 못한다.
 *
 * 남긴 파일은 저장소 밖에 둔다. 확인용이라 커밋할 것이 아니다.
 */

/**
 * 어디에 남길지. **이 값을 주지 않으면 이 판은 건너뛴다.**
 *
 * 평소에는 돌 이유가 없다. 내용 단언은 `ledger-export.spec.ts` 가 이미 하고, 여기는
 * 사람이 엑셀로 열어 보려고 부르는 자리다. CI 에서 자동으로 돌면 없는 폴더에 쓰다가
 * 애먼 곳이 빨개진다.
 *
 * 부르는 법: `POCKET_EXPORT_OUT=/tmp/내보내기확인 npx playwright test e2e/specs/export-artifact.spec.ts --project=mobile-chromium`
 */
const OUT = process.env.POCKET_EXPORT_OUT;

test('엑셀과 CSV 를 실제로 내려받아 파일로 남긴다', async ({ page, prep, settings }) => {
  test.skip(OUT == null, 'POCKET_EXPORT_OUT 을 주면 그 폴더에 실물을 남긴다');
  /*
    세 시트가 다 채워지게 심는다. **분류를 붙이고, 수입과 이체도 넣는다.**
    분류 없는 지출만 심으면 카테고리별 요약이 한 줄짜리가 되고, 이체가 요약에서 빠지는지도
    못 본다(ADR-0005). 긴 한글 상호를 하나 넣어 칸 너비도 눈으로 확인한다.
  */
  const ids = await prep.categoryIds();
  const food = ids.get('식비');
  const cafe = ids.get('카페·간식');
  const health = ids.get('건강·미용');

  await prep.addTransaction({ amount: 12_000, daysAgo: 0, merchant: '김밥천국', categoryId: food });
  await prep.addTransaction({ amount: 4_500, daysAgo: 1, merchant: '스타벅스', categoryId: cafe });
  await prep.addTransaction({ amount: 2_960, daysAgo: 2, merchant: '카카오T' });
  // 수식으로 읽히면 안 되는 상호. 내보낸 파일은 남에게 넘기라고 만든 물건이다.
  await prep.addTransaction({ amount: 1_000, daysAgo: 2, merchant: "=cmd|'/C calc'!A1" });
  await prep.addTransaction({ amount: 38_000, daysAgo: 3, merchant: '쿠팡 로켓배송' });
  await prep.addTransaction({
    amount: 5_000,
    daysAgo: 4,
    merchant: '남푸른약국',
    categoryId: health,
  });
  await prep.addTransaction({ amount: 2_400_000, daysAgo: 5, merchant: '월급', type: 'income' });
  // 이체는 월별·카테고리별 요약 어디에도 안 들어가야 한다.
  await prep.addTransaction({ amount: 800_000, daysAgo: 6, merchant: '카드값', type: 'transfer' });

  await settings.open();
  await settings.waitReady();

  // 형식마다 한 번씩. 한 번 만든 뒤에는 그 자리가 결과 줄로 바뀌어서 이어 누를 수 없다.
  await settings.ledgerExport.run('전체', 'xlsx');
  await page.keyboard.press('Escape');
  await settings.ledgerExport.run('전체', 'csv');

  const files = await readSavedFiles(page);
  expect(files.length).toBeGreaterThanOrEqual(2);

  for (const file of files) {
    writeFileSync(`${OUT}/${file.fileName}`, Buffer.from(file.data, 'base64'));
    // 이름을 찍어 둬야 바깥에서 무엇을 열어 볼지 안다.
    console.log(`남김: ${OUT}/${file.fileName} (${file.mimeType})`);
  }
});
