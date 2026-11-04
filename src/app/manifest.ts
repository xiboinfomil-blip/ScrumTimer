import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Infomil Mauritius - Point quotidien',
    short_name: 'Infomil Mauritius',
    description: 'Le point quotidien de votre équipe Infomil. Connexion nécessaire.',
    start_url: '/participants',
    scope: '/',
    lang: 'fr',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    background_color: '#ffffff',
    theme_color: '#205f9d',
    icons: [
      { src: '/app-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}