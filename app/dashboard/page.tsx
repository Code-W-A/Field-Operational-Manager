"use client"

import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { StatusBox } from "@/components/status-box"
import { WorkBubble } from "@/components/work-bubble"
import { useDashboardStatus } from "@/hooks/use-dashboard-status"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function Dashboard() {
  const router = useRouter()
  const { buckets, personal, loading } = useDashboardStatus()

  const bubble = (color: string) => (it: any) => (
    <WorkBubble
      key={it.id}
      title={it.locatie}
      subtitle={it.equipmentLabel}
      colorClass={color}
      onClick={() => router.push(`/dashboard/lucrari/${it.id}`)}
      className="mb-2"
    />
  )

  if (loading) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Status Lucrări" text="Vizualizare rapidă a stării lucrărilor active" />
        
        {/* Skeleton pentru status boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="py-3">
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="overflow-hidden">
                <div className="space-y-2">
                  <Skeleton className="h-12 w-36 rounded-full" />
                  <Skeleton className="h-12 w-36 rounded-full" />
                  <Skeleton className="h-12 w-36 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton pentru personal board */}
        <div className="mt-8">
          <Skeleton className="h-7 w-48 mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="py-3">
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-36 rounded-full" />
                    <Skeleton className="h-12 w-36 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Status Lucrări" text="Vizualizare rapidă a stării lucrărilor active" />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-3">
        <StatusBox title="Întârziate" footer={`Total lucrari: ${buckets.intarziate.length}`}>
          {buckets.intarziate.map(bubble("bg-red-600"))}
        </StatusBox>
        <StatusBox title="Amânate" footer={`Total lucrari: ${buckets.amanate.length}`}>
          {buckets.amanate.map(bubble("bg-violet-600"))}
        </StatusBox>
        <StatusBox title="Listate" footer={`Total lucrari: ${buckets.listate.length}`}>
          {buckets.listate.map(bubble("bg-gray-600"))}
        </StatusBox>
        <StatusBox title="Nepreluate" footer={`Total lucrari: ${buckets.nepreluate.length}`}>
          {buckets.nepreluate.map(bubble("bg-orange-600"))}
        </StatusBox>
        <StatusBox title="Nefacturate" footer={`Total lucrari: ${buckets.nefacturate.length}`}>
          {buckets.nefacturate.map(bubble("bg-rose-600"))}
        </StatusBox>
        <StatusBox title="Necesită ofertă" footer={`Total lucrari: ${buckets.necesitaOferta.length}`}>
          {buckets.necesitaOferta.map(bubble("bg-sky-600"))}
        </StatusBox>
        <StatusBox title="Ofertate (în așteptare)" footer={`Total lucrari: ${buckets.ofertate.length}`}>
          {buckets.ofertate.map(bubble("bg-indigo-600"))}
        </StatusBox>
        <StatusBox title="Status oferte (acceptate)" footer={`Total lucrari: ${buckets.statusOferteAcceptate.length}`}>
          {buckets.statusOferteAcceptate.map(bubble("bg-green-600"))}
        </StatusBox>
        <StatusBox title="Status oferte (refuzate)" footer={`Total lucrari: ${buckets.statusOferteRefuzate.length}`}>
          {buckets.statusOferteRefuzate.map(bubble("bg-red-700"))}
        </StatusBox>
        <StatusBox title="Stare echipament" footer={`Total lucrari: ${buckets.equipmentStatus.length}`}>
          {buckets.equipmentStatus.map(bubble("bg-amber-600"))}
        </StatusBox>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-3">Status încărcare personal</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, (personal.technicians?.length || 0) + 1)}, minmax(220px, 1fr))` }}>
          <StatusBox title="Dispecer" footer={`Total lucrari: ${personal.dispatcher.items.length}`}> 
            {personal.dispatcher.items.map(bubble("bg-blue-600"))}
          </StatusBox>
          {personal.technicians.map((col) => (
            <StatusBox key={col.name} title={col.name} footer={`Total lucrari: ${col.items.length}`}>
              {col.items.map(bubble("bg-gray-700"))}
            </StatusBox>
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
