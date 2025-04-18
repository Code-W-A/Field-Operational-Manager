import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/AuthContext"
import { FirebaseProvider } from "@/components/firebase-provider"
import { FirebaseCheck } from "@/components/firebase-check"
import { MockDataProvider } from "@/contexts/MockDataContext"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Sistem Management Lucrări",
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
    <html lang="ro">
      <body className={inter.className}>
        <MockDataProvider>
          <FirebaseProvider>
            <FirebaseCheck />
            <AuthProvider>{children}</AuthProvider>
          </FirebaseProvider>
        </MockDataProvider>
      </body>
    </html>
  )
}
