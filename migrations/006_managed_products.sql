CREATE TABLE managed_products (
  id text PRIMARY KEY,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE UNIQUE INDEX managed_products_sku ON managed_products ((data->'draft'->>'sku'))
  WHERE COALESCE(data->'draft'->>'sku', '') <> '';
