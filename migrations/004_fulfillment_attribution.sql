-- Nullable legacy fields: do not invent historical packers or payment references.
ALTER TABLE shipments ADD COLUMN packed_by_user_id text;
ALTER TABLE shipments ADD COLUMN packed_at timestamptz;
ALTER TABLE shipments ADD COLUMN created_by_user_id text;
ALTER TABLE shipments ADD COLUMN tracking_entered_by_user_id text;
ALTER TABLE tracking_events ADD COLUMN actor_user_id text;
ALTER TABLE orders ADD COLUMN stripe_charge_id text;
-- Existing JSON snapshots remain authoritative; promote only known recorded values.
UPDATE shipments SET packed_at = (data->>'packedAt')::timestamptz;
CREATE INDEX orders_stripe_charge ON orders(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
