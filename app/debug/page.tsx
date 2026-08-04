"use client"

import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function DebugPage() {
  const { user, userData, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Se încarcă...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Informații Debugging</CardTitle>
          <CardDescription>Verifică datele utilizatorului curent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium">Autentificat:</h3>
            <p>{user ? "Da" : "Nu"}</p>
          </div>

          {user && (
            <>
              <div>
                <h3 className="font-medium">UID:</h3>
                <p>{user.uid}</p>
              </div>
              <div>
                <h3 className="font-medium">Email:</h3>
                <p>{user.email}</p>
              </div>
            </>
          )}

          {userData && (
            <>
              <div>
                <h3 className="font-medium">Nume:</h3>
                <p>{userData.displayName}</p>
              </div>
              <div>
                <h3 className="font-medium">Rol:</h3>
                <p className="font-bold">{userData.role}</p>
              </div>
            </>
          )}

          <div className="flex flex-col gap-2 pt-4">
            <Button asChild>
              <Link href="/dashboard">Înapoi la Dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/utilizatori">Încearcă Pagina Utilizatori</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
