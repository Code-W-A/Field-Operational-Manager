import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Skeleton } from "@/components/ui/skeleton"

export default function ContracteLoading() {
  return (
    <DashboardShell>
      <DashboardHeader heading="Contracte" text="Gestionați contractele din sistem">
        <Skeleton className="h-10 w-[120px]" />
      </DashboardHeader>
      <div className="divide-border-200 divide-y rounded-md border">
        <div className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
