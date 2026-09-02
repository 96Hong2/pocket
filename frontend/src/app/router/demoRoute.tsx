import { lazy, type ComponentType } from 'react';

type DemoModule = { default: ComponentType };

/**
 * 공용 UI 갤러리는 `shared/ui/__demo__` 가 정본이다.
 * glob 으로 찾는 이유는 그 폴더가 아직 없어도 빌드가 깨지지 않게 하기 위해서다.
 */
async function loadDemoGallery(): Promise<DemoModule> {
  const modules = import.meta.glob('../../shared/ui/__demo__/index.{ts,tsx}') as Record<
    string,
    () => Promise<Record<string, unknown>>
  >;
  const loader = Object.values(modules)[0];
  if (!loader) return { default: MissingDemo };

  // 갤러리는 named export 로 내보낸다. lazy 는 default 를 요구하므로 여기서 맞춰 준다.
  const mod = await loader();
  const component = (mod.default ?? mod.UiShowcase) as ComponentType | undefined;
  return { default: component ?? MissingDemo };
}

function MissingDemo() {
  return (
    <div className="page">
      <h1 className="page__title">공용 UI 갤러리</h1>
      <p className="page__lead">shared/ui/__demo__ 가 아직 없어요.</p>
    </div>
  );
}

/** 개발 빌드에서만 값이 있다. prod 번들에서는 갤러리 코드가 통째로 빠진다. */
export const DemoGallery = import.meta.env.DEV ? lazy(loadDemoGallery) : null;
