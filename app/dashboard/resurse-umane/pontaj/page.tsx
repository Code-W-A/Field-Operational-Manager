import { redirect } from "next/navigation"

export default async function PontajRedirectPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === "string") params.set(k, v)
    else if (Array.isArray(v)) v.forEach((vv) => params.append(k, vv))
  }
  const qs = params.toString()
  redirect(`/dashboard/resurse-umane/condica-prezenta${qs ? `?${qs}` : ""}`)
}


