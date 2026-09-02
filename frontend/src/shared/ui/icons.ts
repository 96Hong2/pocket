/**
 * `public/icons` 에 들어 있는 아이콘 이름과 경로.
 * 화면에서 `/icons/...` 문자열을 직접 쓰지 않고 `iconUrl()` 로만 만든다.
 */

/** 128px. 기본으로 쓴다. */
export const SM_ICONS = [
  '01_coins',
  '02_gold_bars',
  '03_growth_chart',
  '04_home',
  '05_choice_arrows',
  '06_coffee',
  '07_heart',
  '08_book',
  '09_rice_bowl',
  '10_bread',
  '11_tshirt',
  '12_house',
  '13_family',
  '14_friends',
  '15_diamond',
  '16_paw',
  '17_wine_glass',
  '18_cleaning_tools',
  '19_necklace',
  '20_computer',
  '21_shield',
  '22_energy_bulb',
  '23_document',
  '24_lock',
  '25_x_mark',
  '26_sparkles',
  '27_clock',
  '28_cash',
  '29_chat',
  '30_bell',
  '31_gift',
  '32_piggybank',
] as const;

/** 320px. 120px 이상으로 크게 보여주는 히어로 일러스트에만 쓴다. */
export const LG_ICONS = [
  '01_coins',
  '02_gold_bars',
  '03_growth_chart',
  '23_document',
  '26_sparkles',
  '28_cash',
  '32_piggybank',
] as const;

export type IconName = (typeof SM_ICONS)[number];
export type IconSize = 'sm' | 'lg';

const LG_SET = new Set<string>(LG_ICONS);

/** lg 로 요청해도 큰 파일이 없는 아이콘이면 sm 으로 돌려준다. */
export function iconUrl(name: IconName, size: IconSize = 'sm'): string {
  const dir = size === 'lg' && LG_SET.has(name) ? 'lg' : 'sm';
  return `${import.meta.env.BASE_URL}icons/${dir}/${name}.png`;
}

/** 기본 카테고리에 붙는 아이콘. 사용자가 바꾼 아이콘이 있으면 그쪽이 우선한다. */
export const DEFAULT_CATEGORY_ICONS: Record<string, IconName> = {
  식비: '09_rice_bowl',
  '카페·간식': '06_coffee',
  교통: '05_choice_arrows',
  쇼핑: '11_tshirt',
  생활: '18_cleaning_tools',
  '주거·고정비': '12_house',
  '여가·취미': '20_computer',
  '건강·미용': '07_heart',
  기타: '26_sparkles',
  수입: '28_cash',
  이체: '28_cash',
};

export const FALLBACK_CATEGORY_ICON: IconName = '26_sparkles';

export function categoryIcon(categoryName: string | undefined): IconName {
  if (!categoryName) return FALLBACK_CATEGORY_ICON;
  return DEFAULT_CATEGORY_ICONS[categoryName] ?? FALLBACK_CATEGORY_ICON;
}
