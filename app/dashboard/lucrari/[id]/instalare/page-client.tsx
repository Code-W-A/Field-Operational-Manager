"use client"
import { useSearchParams } from "next/navigation"
import { InstallationWorkspace } from "@/components/installation-workspace"
export function InstallationPageClient({ workId }: { workId: string }) {
  const search = useSearchParams()
  return <InstallationWorkspace workId={workId} equipmentId={search.get("equipmentId") || undefined} sheetId={search.get("sheetId") || undefined} complete={search.get("complete") === "1"} />
}
