import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/AuthContext"
import { FirebaseProvider } from "@/components/firebase-provider"
import { FirebaseCheck } from "@/components/firebase-check"
import { MockDataProvider } from "@/contexts/MockDataContext"
import { NotificationsProvider } from "@/components/notifications-provider"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"] })

// Actualizăm titlul în metadata
export const metadata: Metadata = {
  title: "Field Operational Manager",
  description: "Aplicație pentru gestionarea lucrărilor de service",
  manifest: "/manifest.json",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ro" suppressHydrationWarning>
      <body className={inter.className}>
        <MockDataProvider>
          <FirebaseProvider>
            <FirebaseCheck />
            <AuthProvider>
              <NotificationsProvider>
                {children}
                <Toaster />
              </NotificationsProvider>
            </AuthProvider>
          </FirebaseProvider>
        </MockDataProvider>
      </body>
    </html>
  )
}
