import { redirect } from "next/navigation"
import { ClientDataRepairTool } from "@/components/client-data-repair-tool"

export default function ClientDataRepairPage() {
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"
  if (!debugEnabled) {
    redirect("/dashboard/admin")
  }

  return (
    <div className="w-full mx-auto py-6 space-y-6">
      <h1 className="text-3xl font-bold">Reparare date clienți</h1>
      <p className="text-muted-foreground">
        Verifică și repară structura datelor clienților și completează ID-uri lipsă pentru echipamente (fără a modifica ID-urile existente).
      </p>

      <ClientDataRepairTool />
    </div>
  )
}

