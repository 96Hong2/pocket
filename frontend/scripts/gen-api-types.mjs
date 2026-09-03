// docs/openapi.json 에서 프론트 타입을 뽑는다. `npm run api:types` 가 이 파일을 부른다.
// 생성물은 커밋한다. CI 의 frontend 잡은 백엔드 없이 도는데 그때도 타입이 있어야 빌드된다.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 버전을 여기 하나에만 적는다. 올릴 때 생성물의 안내 문구도 같이 바뀐다.
const GENERATOR = 'openapi-typescript@7.13.0';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(root, '../docs/openapi.json');
const output = resolve(root, 'src/shared/api/schema.gen.ts');

const COMMAND = 'npm run api:types';

const BANNER = `/**
 * docs/openapi.json 에서 뽑은 타입이다. **손으로 고치지 않는다.**
 * 스펙이 바뀌면 프론트에서 \`${COMMAND}\` 를 다시 돌려 이 파일을 새로 뽑는다.
 * (내부적으로 \`npx -y ${GENERATOR}\` 를 부른다)
 *
 * ${GENERATOR.split('@')[0]} 를 devDependency 로 넣지 않는다.
 * 이 레포 typescript 는 7.x 인데 그 도구는 peer 로 5.x 를 요구하고,
 * 억지로 설치하면 \`ts.factory\` 가 없어 실행 중에 죽는다. npx 로 부르면 자기 typescript 를 쓴다.
 *
 * 짧은 별칭은 같은 폴더의 types.ts 가 재수출한다. 화면은 그쪽을 쓴다.
 */
`;

execFileSync('npx', ['-y', GENERATOR, input, '-o', output], { stdio: 'inherit' });

const generated = readFileSync(output, 'utf8');
writeFileSync(output, `${BANNER}\n${generated}`, 'utf8');

console.log(`배너를 붙였다: ${output}`);
