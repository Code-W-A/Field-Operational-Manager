"use client"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { EquipmentReport } from "@/components/equipment-report"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState } from "react"

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("equipment")

  return (
    <DashboardShell>
      <DashboardHeader heading="Rapoarte" text="Generează și vizualizează rapoarte pentru echipamente și intervenții" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-1 md:grid-cols-2">
          <TabsTrigger value="equipment">Rapoarte per Echipament</TabsTrigger>
          <TabsTrigger value="annual">Analiză Anuală</TabsTrigger>
        </TabsList>

        <TabsContent value="equipment" className="pt-4">
          <EquipmentReport className="w-full" reportType="detailed" />
        </TabsContent>

        <TabsContent value="annual" className="pt-4">
          <EquipmentReport className="w-full" reportType="annual" />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  )
}
