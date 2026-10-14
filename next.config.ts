import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/mood-meters/decks/*': ['./scripts/fetch-google-slide.ps1'],
    '/mood-meters/slides/*/*': ['./scripts/fetch-google-slide.ps1'],
  },
};

export default config;