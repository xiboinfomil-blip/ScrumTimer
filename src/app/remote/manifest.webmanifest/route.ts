export function GET() {
  return Response.json({
    id: '/remote',
    start_url: '/remote',
    scope: '/remote',
    name: 'Infomil Télécommande',
    short_name: 'Télécommande',
    description: 'La télécommande mobile du minuteur Infomil. Connexion nécessaire.',
    lang: 'fr',
    display: 'standalone',
    background_color: '#205f9d',
    theme_color: '#205f9d',
    orientation: 'any',
    icons: [
      { src: '/remote/icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/remote/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}