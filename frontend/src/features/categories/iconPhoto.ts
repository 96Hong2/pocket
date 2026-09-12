/**
 * 고른 사진을 아이콘 크기로 줄인다.
 *
 * **줄이는 일은 앱이 한다.** 카테고리 목록은 한 번에 다 내려오므로 원본을 그대로 저장하면
 * 사진 한 장 때문에 모든 화면의 첫 조회가 느려진다. 서버 상한은 여기서 만든 것보다
 * 한참 크게 잡혀 있어(`app/domain/category_icons.py`), 이 줄이기가 실패해도 막히지는 않는다.
 *
 * 잘라내기 자리는 가운데다. 자를 자리를 손으로 고르게 하면 시트 안에 편집 화면이 하나 더
 * 생긴다. 아이콘은 54px 짜리 동그라미라 가운데로 충분하다.
 *
 * 🔴 **`<img>` 로 읽는 길을 먼저 쓰지 않는다.** 실기기에서 앨범 사진이 늘 「사진을 읽지
 * 못했어요」로 끝났다. 같은 값이 서버로는 잘 가서(캡처 인식은 됐다) 값이 깨진 것이 아니라
 * 읽는 길이 막힌 것이다. `img.src = "data:..."` 는 웹뷰의 이미지 출처 규칙을 타는데,
 * `createImageBitmap(Blob)` 은 그 길을 안 지나고 형식도 더 넓게 읽는다.
 */

/** 만들어 낼 정사각 한 변(px). 가장 큰 아바타(58px)의 세 배를 넘는다. */
const SIDE = 256;

/** 원본이 이보다 크면 아예 읽지 않는다. 데이터 URI 문자 수 기준. */
const SOURCE_LIMIT = 12_000_000;

const TYPES = ['image/webp', 'image/jpeg'] as const;

export class IconPhotoError extends Error {}

/** 읽어 온 그림 하나. 캔버스가 받을 수 있는 두 가지를 한 이름으로 다룬다. */
type Source = ImageBitmap | HTMLImageElement;

/**
 * 데이터 URI 사진 → 정사각 256px 데이터 URI.
 *
 * webp 를 먼저 시도하고 안 되는 기기에서는 jpeg 로 떨어진다. png 는 쓰지 않는다.
 * 사진은 색이 많아 png 로 두면 같은 그림이 대여섯 배가 된다.
 */
export async function toIconPhoto(dataUri: string): Promise<string> {
  const source = normalizeUri(dataUri);
  if (source.length > SOURCE_LIMIT) {
    throw new IconPhotoError('사진이 너무 커요. 다른 사진으로 골라 주세요.');
  }

  const image = await load(source);
  const side = Math.min(width(image), height(image));
  if (side === 0) throw new IconPhotoError('사진을 읽지 못했어요. 다시 골라 주세요.');

  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext('2d');
  if (ctx == null) throw new IconPhotoError('사진을 줄이지 못했어요. 다시 골라 주세요.');

  ctx.drawImage(
    image,
    (width(image) - side) / 2,
    (height(image) - side) / 2,
    side,
    side,
    0,
    0,
    SIDE,
    SIDE,
  );
  close(image);

  for (const type of TYPES) {
    const encoded = canvas.toDataURL(type, 0.85);
    // 못 만드는 형식이면 브라우저가 조용히 png 를 돌려준다. 형식으로 확인한다.
    if (encoded.startsWith(`data:${type};base64,`)) return encoded;
  }
  throw new IconPhotoError('이 기기에서는 사진을 아이콘으로 쓸 수 없어요.');
}

/**
 * 브릿지가 돌려준 값을 데이터 URI 한 모양으로 맞춘다.
 *
 * 접두사 없이 base64 만 오는 기기가 있다. 서버로 보낼 때는 그대로도 통했지만 여기서는
 * 읽을 수 없는 값이 된다. 형식을 모를 때는 jpeg 로 본다. 실제 형식이 달라도
 * `createImageBitmap` 은 내용으로 판단한다.
 */
function normalizeUri(raw: string): string {
  const value = raw.trim();
  if (value === '') throw new IconPhotoError('사진을 읽지 못했어요. 다시 골라 주세요.');
  return value.startsWith('data:') ? value : `data:image/jpeg;base64,${value}`;
}

/**
 * 데이터 URI 를 그림으로 읽는다.
 *
 * 두 길을 순서대로 쓴다. `createImageBitmap` 이 먼저다(웹뷰의 이미지 출처 규칙을 안 타고
 * 읽을 수 있는 형식이 넓다). 그것이 없는 옛 웹뷰에서만 `<img>` 로 떨어진다.
 */
async function load(dataUri: string): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(toBlob(dataUri));
    } catch {
      // 여기서 끝내지 않는다. 형식을 못 읽는 경우도 있어 아래 길을 한 번 더 준다.
    }
  }
  return loadElement(dataUri);
}

function loadElement(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new IconPhotoError('사진을 읽지 못했어요. 다시 골라 주세요.'));
    image.src = dataUri;
  });
}

/** 데이터 URI 의 base64 를 바이트로 푼다. `fetch(dataUri)` 는 웹뷰가 막는 일이 있어 쓰지 않는다. */
function toBlob(dataUri: string): Blob {
  const comma = dataUri.indexOf(',');
  const head = dataUri.slice(5, comma);
  const type = head.replace(';base64', '') || 'image/jpeg';
  const binary = atob(dataUri.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function width(image: Source): number {
  return image.width;
}

function height(image: Source): number {
  return image.height;
}

/** 비트맵은 다 쓰면 놓아준다. 안 놓으면 고를 때마다 그림 한 장씩 메모리에 쌓인다. */
function close(image: Source): void {
  if ('close' in image) image.close();
}
