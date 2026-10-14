import { remoteCatalog } from '@/lib/google-slides';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(remoteCatalog);
}