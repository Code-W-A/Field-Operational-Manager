"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { ClientDataRepairTool } from "@/components/client-data-repair-tool"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, ShieldAlert } from "lucide-react"

export default function AdminPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      if (user.role === "admin") {
        setIsAdmin(true)
      } else {
        router.push("/dashboard")
      }
    } else if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  if (loading || !isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <ShieldAlert className="h-6 w-6 mr-2 text-amber-500" />
        <h1 className="text-2xl font-bold">Administrare sistem</h1>
      </div>

      <Tabs defaultValue="data-repair">
        <TabsList>
          <TabsTrigger value="data-repair">Reparare date</TabsTrigger>
          <TabsTrigger value="system-logs">Loguri sistem</TabsTrigger>
        </TabsList>
        <TabsContent value="data-repair" className="mt-4">
          <ClientDataRepairTool />
        </TabsContent>
        <TabsContent value="system-logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Loguri sistem</CardTitle>
              <CardDescription>Vizualizați logurile de sistem pentru a monitoriza activitatea</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Funcționalitate în dezvoltare</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
