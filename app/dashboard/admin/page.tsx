"use client"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { Settings, Mail, FileText, Database, PenToolIcon as Tool, FileCode, FileCheck } from "lucide-react"

export default function AdminPage() {
  const router = useRouter()

  const adminTools = [
    {
      title: "Setări Email",
      description: "Configurați setările pentru trimiterea email-urilor",
      icon: <Mail className="h-6 w-6" />,
      href: "/dashboard/admin/email-debug",
    },
    {
      title: "Loguri Email",
      description: "Vizualizați istoricul email-urilor trimise",
      icon: <FileText className="h-6 w-6" />,
      href: "/dashboard/admin/email-logs",
    },
    {
      title: "Probleme scanare",
      description: "Aprobați manual verificări raportate de tehnicieni",
      icon: <FileCheck className="h-6 w-6" />,
      href: "/dashboard/admin/scan-issues",
    },
    {
      title: "Administrare Contracte",
      description: "Gestionați contractele din sistem",
      icon: <FileCheck className="h-6 w-6" />,
      href: "/dashboard/admin/contracte",
    },
    {
      title: "Reparare Date Clienți",
      description: "Instrument pentru repararea datelor clienților",
      icon: <Tool className="h-6 w-6" />,
      href: "/dashboard/admin",
      onClick: () => {
        const confirmed = window.confirm("Acest instrument va repara datele clienților. Doriți să continuați?")
        if (confirmed) {
          // Implementare pentru repararea datelor clienților
        }
      },
    },
    {
      title: "Reparare ID-uri Echipamente",
      description: "Instrument pentru repararea ID-urilor echipamentelor",
      icon: <Database className="h-6 w-6" />,
      href: "/dashboard/admin",
      onClick: () => {
        const confirmed = window.confirm("Acest instrument va repara ID-urile echipamentelor. Doriți să continuați?")
        if (confirmed) {
          // Implementare pentru repararea ID-urilor echipamentelor
        }
      },
    },
    {
      title: "Generare Coduri QR",
      description: "Generați coduri QR pentru echipamente",
      icon: <FileCode className="h-6 w-6" />,
      href: "/dashboard/admin",
      onClick: () => {
        // Implementare pentru generarea codurilor QR
      },
    },
  ]

  return (
    <DashboardShell>
      <DashboardHeader heading="Administrare" text="Instrumente și setări administrative pentru sistem">
        <Button variant="outline">
          <Settings className="mr-2 h-4 w-4" /> Setări Sistem
        </Button>
      </DashboardHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {adminTools.map((tool, index) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center">
                <div className="mr-2 text-primary">{tool.icon}</div>
                {tool.title}
              </CardTitle>
              <CardDescription>{tool.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="default"
                className="w-full"
                onClick={tool.onClick ? tool.onClick : () => router.push(tool.href)}
              >
                Accesează
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardShell>
  )
}
