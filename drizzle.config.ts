import { createRequire } from 'node:module';
import { defineConfig } from 'drizzle-kit';

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is missing. Configure the private environment before using Drizzle.');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  dbCredentials: { url },
  strict: true,
  verbose: false,
});