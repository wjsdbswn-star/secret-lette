-- v10: 암호문만 저장합니다. 복호화 키와 원문은 절대로 저장하지 않습니다.
-- 기존 v7 letters 테이블과 분리하여 구버전 편지를 손상시키지 않습니다.
CREATE TABLE IF NOT EXISTS letters_v10 (
 id TEXT PRIMARY KEY,
 mode TEXT NOT NULL CHECK (mode IN ('single','group')),
 duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 1 AND 2678399),
 iv TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 unopened_until_ms INTEGER NOT NULL,
 opened_at_ms INTEGER,
 expires_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_letters_v10_pending ON letters_v10 (unopened_until_ms) WHERE opened_at_ms IS NULL;
CREATE INDEX IF NOT EXISTS idx_letters_v10_expired ON letters_v10 (expires_at_ms) WHERE opened_at_ms IS NOT NULL;
