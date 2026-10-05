import { Suspense } from "react"
import { InstallationPageClient } from "./page-client"

export default async function InstallationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Suspense fallback={<p>Se încarcă instalarea…</p>}><InstallationPageClient workId={id} /></Suspense>
}
