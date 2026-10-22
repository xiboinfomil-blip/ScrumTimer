import { ImageResponse } from 'next/og';

export function GET(request: Request) {
  const size = new URL(request.url).searchParams.get('size') === '512' ? 512 : 192;
  const unit = size / 512;

  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#205f9d', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', position: 'relative', width: 208 * unit, height: 320 * unit, borderRadius: 36 * unit, background: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: 180 * unit, height: 288 * unit, borderRadius: 25 * unit, background: '#205f9d', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', position: 'relative', width: 132 * unit, height: 132 * unit, borderRadius: 66 * unit, background: '#ec8b23', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', position: 'absolute', top: -14 * unit, width: 40 * unit, height: 12 * unit, borderRadius: 6 * unit, background: '#ec8b23' }} />
            <div style={{ display: 'flex', position: 'absolute', top: 25 * unit, left: 61 * unit, width: 10 * unit, height: 46 * unit, borderRadius: 5 * unit, background: '#ffffff' }} />
            <div style={{ display: 'flex', position: 'absolute', top: 61 * unit, left: 61 * unit, width: 35 * unit, height: 10 * unit, borderRadius: 5 * unit, background: '#ffffff' }} />
          </div>
        </div>
        <div style={{ display: 'flex', position: 'absolute', top: 21 * unit, width: 52 * unit, height: 8 * unit, borderRadius: 4 * unit, background: '#ffffff' }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 21 * unit, width: 44 * unit, height: 8 * unit, borderRadius: 4 * unit, background: '#ffffff' }} />
      </div>
    </div>,
    {
      width: size,
      height: size,
      headers: { 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
    },
  );
}