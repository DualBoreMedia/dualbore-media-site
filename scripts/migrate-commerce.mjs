import pg from 'pg';
import { runMigrations } from '../netlify/commerce/repository.mjs';

// DATABASE_URL is server-only. Never print the connection string or driver errors
// (they can contain credentials, hostnames, or customer information).
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to apply commerce migrations.');
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const names = await runMigrations(pool);
    console.log(`Commerce migrations verified: ${names.join(', ')}`);
  } catch {
    console.error('Commerce migration failed. Verify database connectivity and migration state using a trusted database administrator.');
    process.exitCode = 1;
  } finally { await pool.end(); }
}
