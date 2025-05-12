"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ProtectedRoute } from "@/components/protected-route"

export default function DashboardPage() {
  const { userData } = useAuth()
  const router = useRouter()

  // Redirect technicians to lucrari page
  useEffect(() => {
    if (userData?.role === "tehnician") {
      router.push("/dashboard/lucrari")
    }
  }, [userData, router])

  // If user is technician, don't render the dashboard content
  if (userData?.role === "tehnician") {
    return null
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Lucrări</CardTitle>
              <CardDescription>Gestionează lucrările în curs și finalizate</CardDescription>
            </CardHeader>
            <CardContent>
              <button
                onClick={() => router.push("/dashboard/lucrari")}
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded w-full"
              >
                Accesează Lucrări
              </button>
            </CardContent>
          </Card>

          {userData?.role !== "tehnician" && (
            <Card>
              <CardHeader>
                <CardTitle>Clienți</CardTitle>
                <CardDescription>Gestionează baza de date cu clienți</CardDescription>
              </CardHeader>
              <CardContent>
                <button
                  onClick={() => router.push("/dashboard/clienti")}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded w-full"
                >
                  Accesează Clienți
                </button>
              </CardContent>
            </Card>
          )}

          {userData?.role === "admin" && (
            <Card>
              <CardHeader>
                <CardTitle>Utilizatori</CardTitle>
                <CardDescription>Gestionează utilizatorii sistemului</CardDescription>
              </CardHeader>
              <CardContent>
                <button
                  onClick={() => router.push("/dashboard/utilizatori")}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded w-full"
                >
                  Accesează Utilizatori
                </button>
              </CardContent>
            </Card>
          )}

          {userData?.role === "admin" && (
            <Card>
              <CardHeader>
                <CardTitle>Loguri</CardTitle>
                <CardDescription>Vizualizează logurile sistemului</CardDescription>
              </CardHeader>
              <CardContent>
                <button
                  onClick={() => router.push("/dashboard/loguri")}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded w-full"
                >
                  Accesează Loguri
                </button>
              </CardContent>
            </Card>
          )}

          {userData?.role === "admin" && (
            <Card>
              <CardHeader>
                <CardTitle>Rapoarte</CardTitle>
                <CardDescription>Generează rapoarte și statistici</CardDescription>
              </CardHeader>
              <CardContent>
                <button
                  onClick={() => router.push("/dashboard/rapoarte")}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded w-full"
                >
                  Accesează Rapoarte
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
