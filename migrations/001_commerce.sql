CREATE TABLE product_variants (
  id text PRIMARY KEY, product_id text NOT NULL, sku text NOT NULL UNIQUE,
  product_name text NOT NULL, size text NOT NULL, active boolean NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0), stripe_price_id text,
  available_quantity integer NOT NULL CHECK (available_quantity >= 0),
  reserved_quantity integer NOT NULL CHECK (reserved_quantity >= 0),
  sold_quantity integer NOT NULL CHECK (sold_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL
);
CREATE TABLE orders (
  id text PRIMARY KEY, order_number text NOT NULL UNIQUE, request_key text UNIQUE,
  stripe_checkout_session_id text UNIQUE, stripe_payment_intent_id text,
  customer_email text, status text NOT NULL CHECK (status IN ('checkout_pending','payment_pending','paid','payment_failed','cancelled','expired','fulfilled','refunded')),
  currency text NOT NULL, subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents integer NOT NULL CHECK (shipping_cents >= 0),
  tax_cents integer CHECK (tax_cents >= 0), total_cents integer CHECK (total_cents >= 0),
  shipping_name text, shipping_address_json jsonb,
  created_at timestamptz NOT NULL, paid_at timestamptz, cancelled_at timestamptz, fulfilled_at timestamptz,
  carrier text, tracking_number text, tracking_url text, shipped_at timestamptz, data jsonb NOT NULL
);
CREATE TABLE order_items (
  id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE, position integer NOT NULL,
  variant_id text NOT NULL REFERENCES product_variants(id), sku_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL, size_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0), unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents = quantity * unit_price_cents),
  data jsonb NOT NULL
);
CREATE TABLE stripe_events (
  stripe_event_id text PRIMARY KEY, event_type text NOT NULL, created_at timestamptz NOT NULL,
  processed_at timestamptz, processing_status text NOT NULL, data jsonb NOT NULL
);
CREATE TABLE inventory_reservations (
  id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), checkout_session_id text,
  variant_id text NOT NULL REFERENCES product_variants(id), quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('reserved','released','sold')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL,
  released_at timestamptz, converted_at timestamptz, data jsonb NOT NULL
);
CREATE INDEX reservations_expiry ON inventory_reservations(status, expires_at);
CREATE INDEX reservations_session ON inventory_reservations(checkout_session_id);
CREATE TABLE email_events (
  id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), email_type text NOT NULL,
  provider text NOT NULL, provider_message_id text, status text NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count >= 0), last_error text,
  created_at timestamptz NOT NULL, sent_at timestamptz, data jsonb NOT NULL,
  UNIQUE(order_id, email_type)
);
