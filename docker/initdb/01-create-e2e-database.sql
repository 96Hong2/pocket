-- e2e 전용 DB. 개발용 pocket 과 갈라 두어 브라우저 테스트가 개발 데이터에 쓰지 않게 한다.
-- 이 스크립트는 데이터 볼륨이 비어 있는 첫 기동에만 실행된다.
-- 내용을 고쳤다면 `make db-reset` 으로 볼륨을 지워야 반영된다.
CREATE DATABASE pocket_e2e OWNER pocket;
