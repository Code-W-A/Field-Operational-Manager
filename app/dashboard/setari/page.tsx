"use client"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { CompanyLogoManager } from "@/components/company-logo-manager"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function SetariPage() {
  const { userData } = useAuth()
  const router = useRouter()

  // Verificăm dacă utilizatorul are drepturi de admin
  useEffect(() => {
    if (userData && userData.role !== "admin") {
      router.push("/dashboard")
    }
  }, [userData, router])

  if (userData?.role !== "admin") {
    return null
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Setări Sistem" text="Configurați setările generale ale sistemului" />

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="rapoarte">Rapoarte</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Setări Generale</CardTitle>
              <CardDescription>Configurați setările generale ale sistemului</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Setările generale vor fi implementate în versiunile viitoare.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rapoarte" className="space-y-4">
          <CompanyLogoManager />
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Setări Email</CardTitle>
              <CardDescription>Configurați setările pentru trimiterea emailurilor</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Setările de email vor fi implementate în versiunile viitoare.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  )
}
