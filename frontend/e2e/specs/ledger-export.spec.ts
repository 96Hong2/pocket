import { exportFileName } from '../../src/features/export/period';
import { CSV_MIME, XLSX_MIME } from '../../src/features/export/workbook';
import { toLedgerDate } from '../../src/shared/lib/format';
import { csvLines, readSavedFiles } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 가계부를 파일로 내려받기.
 *
 * 이 기능이 파는 것은 편의가 아니라 **믿음**이다(ADR-0032). 그래서 여기서 지키는 것은
 * 「버튼이 눌린다」 가 아니라 **정말 나갔나, 그 안에 정말 들어 있나** 다.
 * 파일 저장은 웹 페이지 바깥에서 일어나 화면에 흔적이 안 남으므로, 브릿지가 남기는
 * 사본(`window.__pocketFiles`)에서 이름·MIME·내용을 꺼내 본다.
 */

/** 내보낼 기간은 시험 안에서 센다. CI 는 UTC 라 모듈 맨 위에서 세면 하루 어긋난다. */
function todayInLedger(): string {
  return toLedgerDate(new Date());
}

test('CSV 로 내보내면 적어 둔 그대로 파일에 담긴다', async ({ page, prep, settings }) => {
  await prep.addTransaction({ amount: 12_000, daysAgo: 0, merchant: '김밥천국' });
  await prep.addTransaction({ amount: 4_500, daysAgo: 1, merchant: '카페' });

  await settings.open();
  await settings.waitReady();

  // 누르기 전에 파일 안에 무엇이 들어가는지 적혀 있다. 열어 보기 전에는 확인할 길이 없다.
  await settings.ledgerExport.openButton.click();
  await expect(settings.ledgerExport.contentsList.first()).toBeVisible();

  await settings.ledgerExport.period('이번 달').click();
  await settings.ledgerExport.csvButton.click();
  await expect(settings.ledgerExport.doneNotice).toBeVisible();

  const files = await readSavedFiles(page);
  expect(files).toHaveLength(1);
  expect(files[0].fileName).toBe(exportFileName('this_month', todayInLedger(), 'csv'));
  expect(files[0].mimeType).toBe(CSV_MIME);

  // 머리줄 하나 + 기록 둘. 오래된 것이 위로 온다.
  const lines = csvLines(files[0]);
  expect(lines).toHaveLength(3);
  expect(lines[0]).toBe('날짜,시간,구분,카테고리,내용,금액,결제수단,메모');
  expect(lines[1]).toContain('카페');
  expect(lines[2]).toContain('김밥천국');
  // 금액은 따옴표 없는 숫자다. 감싸면 엑셀이 글자로 읽어 합계가 안 된다.
  expect(lines[2]).toContain(',12000,');

  // 화면이 말한 건수와 파일 안의 줄 수가 같아야 한다. 하나라도 어긋나면 둘 다 못 믿는다.
  await expect(settings.ledgerExport.doneNotice).toContainText('2건');
});

test('엑셀로 내보내면 엑셀 파일이 나간다', async ({ page, prep, settings }) => {
  await prep.addTransaction({ amount: 30_000, daysAgo: 0, merchant: '마트' });

  await settings.open();
  await settings.waitReady();
  await settings.ledgerExport.run('이번 달', 'xlsx');

  const files = await readSavedFiles(page);
  expect(files).toHaveLength(1);
  expect(files[0].fileName).toBe(exportFileName('this_month', todayInLedger(), 'xlsx'));
  expect(files[0].mimeType).toBe(XLSX_MIME);

  /*
    xlsx 는 XML 몇 장을 zip 으로 묶은 것이다. 브라우저에서 풀어 볼 수는 없지만, 첫 네 바이트가
    zip 표식(`PK\x03\x04`)인지는 볼 수 있다. 이름만 .xlsx 로 붙이고 엉뚱한 것을 담아 보내는
    사고가 여기서 걸린다.
  */
  const head = Buffer.from(files[0].data, 'base64').subarray(0, 4);
  expect([...head]).toEqual([0x50, 0x4b, 0x03, 0x04]);
});

test('적어 둔 것이 없는 기간을 고르면 빈 파일을 만들지 않는다', async ({
  page,
  prep,
  settings,
}) => {
  await prep.addTransaction({ amount: 9_000, daysAgo: 0, merchant: '편의점' });

  await settings.open();
  await settings.waitReady();
  await settings.ledgerExport.openButton.click();
  // 지난 달에는 아무것도 안 심었다.
  await settings.ledgerExport.period('지난 달').click();
  await settings.ledgerExport.csvButton.click();

  await expect(settings.ledgerExport.failNotice).toHaveText(
    '그 기간에 적어 둔 기록이 없어요. 다른 기간을 골라 보세요.',
  );
  // 머리줄만 든 파일을 내려놓으면, 받은 사람은 기록이 사라진 줄 안다.
  expect(await readSavedFiles(page)).toHaveLength(0);
});

test('이체는 내역에 남고 요약에서만 빠진다', async ({ page, prep, settings }) => {
  await prep.addTransaction({ amount: 20_000, daysAgo: 0, merchant: '점심' });
  await prep.addTransaction({
    amount: 1_000_000,
    daysAgo: 0,
    merchant: '적금이체',
    type: 'transfer',
  });

  await settings.open();
  await settings.waitReady();
  await settings.ledgerExport.run('이번 달', 'csv');

  const lines = csvLines((await readSavedFiles(page))[0]);
  // 적어 둔 것은 그대로 나간다. 파일에서 사라지면 그건 다른 문제다(ADR-0005).
  expect(lines.filter((line) => line.includes('적금이체'))).toHaveLength(1);
  expect(lines.some((line) => line.includes('이체'))).toBe(true);
  await expect(settings.ledgerExport.doneNotice).toContainText('2건');
});

test('닫았다 다시 열면 지난번 결과가 남아 있지 않다', async ({ prep, settings }) => {
  await prep.addTransaction({ amount: 5_000, daysAgo: 0, merchant: '분식' });

  await settings.open();
  await settings.waitReady();
  await settings.ledgerExport.run('이번 달', 'csv');

  await settings.ledgerExport.sheet.getByRole('button', { name: '닫기' }).click();
  await expect(settings.ledgerExport.sheet).toBeHidden();

  // 남겨 두면 다시 열었을 때 방금 저장한 것으로 읽힌다.
  await settings.ledgerExport.openButton.click();
  await expect(settings.ledgerExport.doneNotice).toHaveCount(0);
  await expect(settings.ledgerExport.period('이번 달')).toHaveAttribute('aria-checked', 'true');
});

test('「준비 중」 은 없어졌고 하위 화면 목록은 그대로다', async ({ appShell, settings }) => {
  await settings.open();
  await settings.waitReady();

  // 못 누르던 자리를 채운 일이라, 그 표시가 남아 있으면 안 채운 것과 같다.
  await expect(settings.text('준비 중')).toHaveCount(0);
  await expect(settings.text('CSV 내보내기')).toHaveCount(0);
  await expect(settings.ledgerExport.openButton).toBeVisible();

  // 내보내기는 그 자리에서 시트를 여는 줄이라 하위 화면 목록에는 안 들어간다.
  await expect(appShell.subScreenLinks('설정 하위 화면')).toHaveText([
    '내 계정',
    '알림 설정',
    '개인정보처리방침',
  ]);
});
