-- participation_rate 컬럼 타입 변경: INTEGER → TEXT
-- 참여단계 텍스트("설계", "구현" 등)를 그대로 저장하기 위함
--
-- SQLite는 ALTER COLUMN을 지원하지 않으므로
-- 테이블 재생성 방식으로 변경합니다.

PRAGMA foreign_keys = OFF;

-- 1. 새 테이블 생성 (participation_rate TEXT)
CREATE TABLE IF NOT EXISTS personnel_audit_history_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id    INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  audit_yearmonth TEXT,
  project_name    TEXT,
  client_org      TEXT,
  sector          TEXT,
  domain          TEXT,
  role            TEXT,
  phase           TEXT,
  participation_rate TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 2. 기존 데이터 이전 (INTEGER → TEXT 자동 캐스팅)
INSERT INTO personnel_audit_history_new
  SELECT id, personnel_id, audit_yearmonth, project_name, client_org,
         sector, domain, role, phase,
         CASE WHEN participation_rate IS NULL THEN NULL
              ELSE CAST(participation_rate AS TEXT)
         END,
         created_at
  FROM personnel_audit_history;

-- 3. 기존 테이블 삭제 후 이름 변경
DROP TABLE personnel_audit_history;
ALTER TABLE personnel_audit_history_new RENAME TO personnel_audit_history;

PRAGMA foreign_keys = ON;
