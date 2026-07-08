import { redirect } from "next/navigation"

type SearchParams = Record<string, string | string[] | undefined>

function toQueryString(searchParams: SearchParams) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else if (value != null) {
      params.set(key, value)
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

export default async function PontajRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {})
  redirect(`/dashboard/resurse-umane/condica-prezenta${toQueryString(resolvedSearchParams)}`)
}
