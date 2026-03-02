ALTER TABLE schedules ADD COLUMN host_access_token TEXT;

UPDATE schedules
SET host_access_token = lower(hex(randomblob(16)))
WHERE host_access_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_host_access_token
	ON schedules(host_access_token);
