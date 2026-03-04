import { redirect } from "next/navigation"

export default async function OpportunityIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = await params
  redirect(`/crm/opportunities/${resolved.id}/timeline`)
}
