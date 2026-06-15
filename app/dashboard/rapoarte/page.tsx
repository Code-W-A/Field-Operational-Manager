"use client"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { EquipmentReport } from "@/components/equipment-report"
import { OvertimeReport } from "@/components/overtime-report"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState } from "react"

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("equipment")

  return (
    <DashboardShell>
      <DashboardHeader heading="Rapoarte" text="Generează și vizualizează rapoarte pentru echipamente, intervenții și ore suplimentare" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="equipment">Rapoarte per Echipament</TabsTrigger>
          <TabsTrigger value="annual">Analiză Anuală</TabsTrigger>
          <TabsTrigger value="overtime">Ore Suplimentare</TabsTrigger>
        </TabsList>

        <TabsContent value="equipment" className="pt-4">
          <EquipmentReport className="w-full" reportType="detailed" />
        </TabsContent>

        <TabsContent value="annual" className="pt-4">
          <EquipmentReport className="w-full" reportType="annual" />
        </TabsContent>

        <TabsContent value="overtime" className="pt-4">
          <OvertimeReport className="w-full" />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  )
}
