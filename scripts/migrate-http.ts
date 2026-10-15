/// <reference types="node" />
// Explicit operator fallback for networks where the standard CLI WebSocket
// transport is unavailable. The normal db:migrate script remains unchanged.
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { configureNeonNetwork } from '../src/lib/neon-network';
const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing database configuration');
  configureNeonNetwork(url);
  await migrate(drizzle(neon(url)), { migrationsFolder: './drizzle', migrationsSchema: 'drizzle', migrationsTable: '__drizzle_migrations' });
  console.log('Official Drizzle HTTP migration completed.');
}
main().catch(() => { console.error('HTTP migration failed; check database connectivity and migration status.'); process.exitCode = 1; });