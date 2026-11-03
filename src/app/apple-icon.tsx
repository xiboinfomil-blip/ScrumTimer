import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#205f9d' }}>
      <div style={{ display: 'flex', width: 112, height: 156, alignItems: 'center', justifyContent: 'center', borderRadius: 24, background: '#fff' }}>
        <div style={{ display: 'flex', width: 96, height: 132, alignItems: 'center', justifyContent: 'center', borderRadius: 18, background: '#eaf2f8' }}>
          <div style={{ display: 'flex', width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, background: '#ec8b23' }}>
            <div style={{ display: 'flex', width: 0, height: 0, borderTop: '12px solid transparent', borderBottom: '12px solid transparent', borderLeft: '18px solid #fff', marginLeft: 5 }} />
          </div>
        </div>
      </div>
    </div>,
    { ...size, headers: { 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } },
  );
}