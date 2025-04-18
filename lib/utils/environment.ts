// Funcție pentru a detecta dacă suntem în mediul de preview v0
export function isPreviewEnvironment(): boolean {
  // Verificăm dacă suntem pe client
  if (typeof window === "undefined") return false

  // Verificăm dacă suntem în mediul de preview v0
  return window.location.hostname.includes("v0.dev") || window.location.hostname.includes("vercel-v0.app")
}

// Funcție pentru a verifica dacă Firebase este disponibil
export function isFirebaseAvailable(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  )
}
