import type { MetadataRoute } from 'next'

/** PWA manifest (M10-02) — installable, standalone, both themes. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Confide',
    short_name: 'Confide',
    description: 'Agency collaboration with client protection built in',
    start_url: '/app',
    display: 'standalone',
    background_color: '#0d0d13',
    theme_color: '#6d5cff',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
