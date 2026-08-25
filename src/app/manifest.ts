import type { MetadataRoute } from 'next'

/** PWA manifest (M10-02) — installable, standalone, both themes. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Confide',
    short_name: 'Confide',
    description: 'Agency collaboration with client protection built in',
    start_url: '/app',
    display: 'standalone',
    // The default theme's own tokens (classic-light, globals.css :root):
    // background = the splash behind the icon, theme = the Android status
    // bar, which sits directly above the app's white top bar. The purple
    // and near-black these replace belonged to no Confide theme at all.
    background_color: '#f5f7f7',
    theme_color: '#ffffff',
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
