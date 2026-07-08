"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { HrTimesheetReport } from "@/components/hr/hr-timesheet-report"
import { OvertimeReport } from "@/components/overtime-report"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TAB_KEYS = ["pontaj", "overtime"] as const
type TabKey = (typeof TAB_KEYS)[number]

export default function HrReportsPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabKey>("pontaj")

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (TAB_KEYS.includes(tab as TabKey)) {
      setActiveTab(tab as TabKey)
      return
    }
    setActiveTab("pontaj")
  }, [searchParams])

  const handleTabChange = (value: string) => {
    const nextTab = TAB_KEYS.includes(value as TabKey) ? (value as TabKey) : "pontaj"
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
      <DashboardHeader heading="Rapoarte HR" text="Vizualizează indicatorii de pontaj și raportul de ore suplimentare." />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pontaj">Pontaj HR</TabsTrigger>
          <TabsTrigger value="overtime">Ore Suplimentare</TabsTrigger>
        </TabsList>

        <TabsContent value="pontaj" className="pt-4">
          <HrTimesheetReport />
        </TabsContent>

        <TabsContent value="overtime" className="pt-4">
          <OvertimeReport className="w-full" />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  )
}

