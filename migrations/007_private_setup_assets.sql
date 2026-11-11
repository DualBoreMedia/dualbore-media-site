-- Private file bytes are separate from the catalog JSON loaded by ordinary reads.
-- No automatic production migration or public object URL is created here.
CREATE TABLE private_setup_assets (
  id text PRIMARY KEY,
  sha256 text NOT NULL UNIQUE CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 48 AND 2097152),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  payload bytea NOT NULL,
  CHECK (octet_length(payload) = size_bytes)
);
CREATE FUNCTION reject_setup_asset_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Setup asset versions are immutable'; END; $$;
CREATE TRIGGER private_setup_asset_immutable BEFORE UPDATE OR DELETE ON private_setup_assets
  FOR EACH ROW EXECUTE FUNCTION reject_setup_asset_mutation();
