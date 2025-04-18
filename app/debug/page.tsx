"use client"

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

export default function DebugPage() {
  const { user, userData, loading } = useAuth()
  const router = useRouter()

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
            <Button onClick={() => router.push("/dashboard")}>Înapoi la Dashboard</Button>
            <Button variant="outline" onClick={() => router.push("/dashboard/utilizatori")}>
              Încearcă Pagina Utilizatori
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
