import type React from "react"
// Adaugă importul pentru CacheProvider
import { CacheProvider } from "@/contexts/CacheContext"
import { AuthProvider } from "@/contexts/AuthContext"

// Modifică componenta pentru a include CacheProvider
export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CacheProvider>{children}</CacheProvider>
    </AuthProvider>
  )
}
