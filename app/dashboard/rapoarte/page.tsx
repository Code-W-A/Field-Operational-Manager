"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { EquipmentReport } from "@/components/equipment-report"
import { OvertimeReport } from "@/components/overtime-report"
import { UninvoicedReport } from "@/components/reports/uninvoiced-report"
import { UserActivityReport } from "@/components/reports/user-activity-report"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TAB_KEYS = ["uninvoiced", "activity", "equipment", "annual", "overtime"] as const
type TabKey = (typeof TAB_KEYS)[number]

export default function ReportsPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabKey>("uninvoiced")

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (TAB_KEYS.includes(tab as TabKey)) {
      setActiveTab(tab as TabKey)
      return
    }
    setActiveTab("uninvoiced")
  }, [searchParams])

  const handleTabChange = (value: string) => {
    const nextTab = TAB_KEYS.includes(value as TabKey) ? (value as TabKey) : "uninvoiced"
    setActiveTab(nextTab)

    try {
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", nextTab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    } catch {
      // ignore URL sync errors
    }
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Rapoarte" text="Generează și vizualizează rapoarte pentru echipamente, intervenții și ore suplimentare" />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-1 md:grid-cols-5">
          <TabsTrigger value="uninvoiced">Tichete nefacturate</TabsTrigger>
          <TabsTrigger value="activity">Activitate utilizator</TabsTrigger>
          <TabsTrigger value="equipment">Rapoarte per Echipament</TabsTrigger>
          <TabsTrigger value="annual">Analiză Anuală</TabsTrigger>
          <TabsTrigger value="overtime">Ore Suplimentare</TabsTrigger>
        </TabsList>

        <TabsContent value="uninvoiced" className="pt-4">
          <UninvoicedReport />
        </TabsContent>

        <TabsContent value="activity" className="pt-4">
          <UserActivityReport />
        </TabsContent>

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
