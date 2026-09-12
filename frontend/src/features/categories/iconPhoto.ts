/**
 * 고른 사진을 아이콘 크기로 줄인다.
 *
 * **줄이는 일은 앱이 한다.** 카테고리 목록은 한 번에 다 내려오므로 원본을 그대로 저장하면
 * 사진 한 장 때문에 모든 화면의 첫 조회가 느려진다. 서버 상한은 여기서 만든 것보다
 * 한참 크게 잡혀 있어(`app/domain/category_icons.py`), 이 줄이기가 실패해도 막히지는 않는다.
 *
 * 잘라내기 자리는 가운데다. 자를 자리를 손으로 고르게 하면 시트 안에 편집 화면이 하나 더
 * 생긴다. 아이콘은 54px 짜리 동그라미라 가운데로 충분하다.
 */

/** 만들어 낼 정사각 한 변(px). 가장 큰 아바타(58px)의 세 배를 넘는다. */
const SIDE = 256;

/** 원본이 이보다 크면 아예 읽지 않는다. 데이터 URI 문자 수 기준. */
const SOURCE_LIMIT = 12_000_000;

const TYPES = ['image/webp', 'image/jpeg'] as const;

export class IconPhotoError extends Error {}

/**
 * 데이터 URI 사진 → 정사각 256px 데이터 URI.
 *
 * webp 를 먼저 시도하고 안 되는 기기에서는 jpeg 로 떨어진다. png 는 쓰지 않는다.
 * 사진은 색이 많아 png 로 두면 같은 그림이 대여섯 배가 된다.
 */
export async function toIconPhoto(dataUri: string): Promise<string> {
  if (dataUri.length > SOURCE_LIMIT) {
    throw new IconPhotoError('사진이 너무 커요. 다른 사진으로 골라 주세요.');
  }

  const image = await load(dataUri);
  const side = Math.min(image.width, image.height);
  if (side === 0) throw new IconPhotoError('사진을 읽지 못했어요. 다시 골라 주세요.');

  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext('2d');
  if (ctx == null) throw new IconPhotoError('사진을 줄이지 못했어요. 다시 골라 주세요.');

  ctx.drawImage(
    image,
    (image.width - side) / 2,
    (image.height - side) / 2,
    side,
    side,
    0,
    0,
    SIDE,
    SIDE,
  );

  for (const type of TYPES) {
    const encoded = canvas.toDataURL(type, 0.85);
    // 못 만드는 형식이면 브라우저가 조용히 png 를 돌려준다. 형식으로 확인한다.
    if (encoded.startsWith(`data:${type};base64,`)) return encoded;
  }
  throw new IconPhotoError('이 기기에서는 사진을 아이콘으로 쓸 수 없어요.');
}

function load(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new IconPhotoError('사진을 읽지 못했어요. 다시 골라 주세요.'));
    image.src = dataUri;
  });
}
