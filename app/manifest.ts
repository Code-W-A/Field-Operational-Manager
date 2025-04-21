import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Field Operational Manager",
    short_name: "FOM",
    description: "Aplicație pentru gestionarea lucrărilor de service",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f56b3",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  }
}
