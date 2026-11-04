import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function brandIcon(size: number) {
  const svg = await readFile(path.join(process.cwd(), 'src/app/icon.svg'));
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#fff' }}>
      <img src={`data:image/svg+xml;base64,${svg.toString('base64')}`} width={size} height={size} alt="" />
    </div>,
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } },
  );
}