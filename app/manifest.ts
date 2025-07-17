import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Field Operational Manager',
    short_name: 'FOM',
    description: 'Aplicație pentru gestionarea operațiunilor de teren',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/logo-placeholder.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo-placeholder.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
