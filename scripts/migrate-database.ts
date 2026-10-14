import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { configureNeonNetwork } from '../src/lib/neon-network';

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd());
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is missing. Configure the private environment first.');
  configureNeonNetwork(url);
  await migrate(drizzle(neon(url)), { migrationsFolder: './drizzle' });
  console.log('Drizzle migrations applied successfully to Neon.');
}
main().catch((error: unknown) => {
  // Driver errors can include connection details or query parameters: never print them.
  console.error('Database migration failed. Check DATABASE_URL, TLS/network access and database permissions. No credentials were logged.');
  const details = error as { code?: unknown; cause?: { code?: unknown }; name?: unknown };
  const code = details.code ?? details.cause?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code)) console.error(`Failure code: ${code}`);
  console.error(`DATABASE_URL configured: ${Boolean(process.env.DATABASE_URL)}`);
  process.exitCode = 1;
});