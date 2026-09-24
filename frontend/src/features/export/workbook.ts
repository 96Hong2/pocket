/**
 * 표를 실제 파일 한 덩이(base64)로 만든다.
 *
 * **xlsx 는 여기서만, 그것도 누른 뒤에 불러온다.** 정적으로 import 하면 가계부를 한 번도
 * 안 내보내는 사람까지 첫 화면에서 그만큼을 받고 시작한다. 미니앱은 첫 로딩이 곧 이탈이라
 * 새 라이브러리는 쓰는 순간에만 받게 나눈다(`docs/DEPENDENCIES.md`, ADR-0032).
 */

/** 엑셀이 자기 파일로 알아보는 MIME. 이걸 틀리면 저장은 되고 열 때 앱이 안 잡힌다. */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const CSV_MIME = 'text/csv';

export interface SheetSpec {
  /** 엑셀 시트 탭에 적히는 이름. */
  name: string;
  header: string[];
  rows: (string | number)[][];
}

export async function toXlsxBase64(sheets: SheetSpec[]): Promise<string> {
  const xlsx = await import('xlsx');
  const book = xlsx.utils.book_new();

  for (const sheet of sheets) {
    const grid = xlsx.utils.aoa_to_sheet([sheet.header, ...sheet.rows]);
    grid['!cols'] = columnWidths(sheet.header, sheet.rows);
    xlsx.utils.book_append_sheet(book, grid, sheet.name);
  }

  /*
    `compression` 을 켠다. 기본값이 무압축(zip STORED)이라 1만 줄짜리가 base64 4.5MB 로
    나오는데, 그 문자열이 그대로 JS↔네이티브 브릿지를 건너고 만드는 동안 힙도 그만큼 먹는다.
    실측으로 크기 3배, 쓰는 동안 힙 2배가 줄었다. 속도는 구조에 따라 오르내려 근거가 아니다.
  */
  return xlsx.write(book, { bookType: 'xlsx', type: 'base64', compression: true }) as string;
}

/**
 * CSV 한 장을 base64 로.
 *
 * 맨 앞에 BOM 을 붙인다. 없으면 엑셀이 UTF-8 인 줄 모르고 시스템 인코딩으로 읽어서 한글이
 * 전부 깨진 채 열린다. 「다른 서비스로 옮기기 좋으라고」 주는 파일이 안 읽히면 뜻이 없다.
 */
export function toCsvBase64(csv: string): string {
  return toBase64(new TextEncoder().encode(`﻿${csv}`));
}

/**
 * 칸 너비. 제목과 값 중 긴 쪽에 맞춘다. 좁으면 날짜 칸이 `#####` 로 뜬다.
 *
 * **한글은 한 글자가 두 칸이다.** `wch` 는 글자 수가 아니라 폭이라, 길이를 그대로 넣으면
 * 「남푸른약국」 이 반쯤 잘리고 옆 칸 글자와 붙어 보인다. 실제로 열어 보고 찾은 자리다.
 */
function columnWidths(header: string[], rows: (string | number)[][]): { wch: number }[] {
  return header.map((label, index) => {
    const longest = rows.reduce(
      (widest, row) => Math.max(widest, displayWidth(String(row[index] ?? ''))),
      displayWidth(label),
    );
    // 메모가 길면 한 칸이 화면을 다 먹는다. 위를 막아 둔다.
    return { wch: Math.min(40, longest + 2) };
  });
}

/**
 * 엑셀이 세는 폭. 한글·한자·가나와 전각 기호는 두 칸으로 센다.
 *
 * 범위는 유니코드 East Asian Width 의 넓은 구간을 추린 것이다. 이모지까지 정확히 재려면
 * 표가 훨씬 길어지는데, 가계부 칸에 들어가는 것은 상호와 분류 이름이라 여기까지면 된다.
 */
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

/**
 * 바이트를 base64 로.
 *
 * 한 번에 펼쳐 넘기면 인자 수 한계에 걸려 몇 만 줄짜리 파일에서 죽는다. 조각으로 나눈다.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}
