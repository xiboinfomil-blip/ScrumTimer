import { brandIcon } from '@/lib/brand/brand-icon';

export function GET(request: Request) {
  return brandIcon(new URL(request.url).searchParams.get('size') === '512' ? 512 : 192);
}