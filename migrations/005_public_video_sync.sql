-- Opt-in additive persistence for public, sanitized upload snapshots and sync outcomes.
-- No customer, provider key or request data is stored.
CREATE TABLE IF NOT EXISTS public_video_snapshots (
 id text PRIMARY KEY,
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public_video_sync_runs (
 id bigserial PRIMARY KEY,
 attempted_at timestamptz NOT NULL,
 updated boolean NOT NULL,
 reason text NOT NULL,
 item_count integer NOT NULL CHECK (item_count >= 0 AND item_count <= 50)
);
CREATE INDEX IF NOT EXISTS public_video_sync_runs_attempted ON public_video_sync_runs (attempted_at DESC);
