-- Additive only: 001 is already applied in the sandbox.
CREATE TABLE customer_profiles (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE shipments (id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), data jsonb NOT NULL);
CREATE TABLE shipment_items (id text PRIMARY KEY, shipment_id text NOT NULL REFERENCES shipments(id), variant_id text NOT NULL REFERENCES product_variants(id), quantity integer NOT NULL CHECK(quantity > 0), data jsonb NOT NULL);
CREATE TABLE tracking_events (id text PRIMARY KEY, shipment_id text NOT NULL REFERENCES shipments(id), data jsonb NOT NULL);
CREATE TABLE audit_events (id text PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target text NOT NULL, created_at timestamptz NOT NULL, data jsonb NOT NULL);
CREATE INDEX audit_events_created ON audit_events(created_at);
CREATE INDEX shipments_order ON shipments(order_id);
CREATE TABLE refund_requests (id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), data jsonb NOT NULL);
CREATE TABLE request_limits (id text PRIMARY KEY, data jsonb NOT NULL);
-- One immutable outbox event per transition/package, not one per broad type.
ALTER TABLE email_events DROP CONSTRAINT email_events_order_id_email_type_key;
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit history is append only'; END; $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
