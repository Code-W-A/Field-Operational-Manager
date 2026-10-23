/** Only explicit ticket origins are propagated; destinations remain local constants. */
export function withTicketOrigin(href: string, source: string | null): string {
  if (!source || !["dashboard", "arhivate", "istoric-echipament"].includes(source)) return href
  const [pathAndQuery, hash] = href.split("#", 2)
  const [path, query] = pathAndQuery.split("?", 2)
  const params = new URLSearchParams(query)
  params.set("from", source)
  return `${path}?${params}${hash === undefined ? "" : `#${hash}`}`
}

/** Override an existing exit destination only for the Dashboard entry flow. */
export function ticketExitHref(source: string | null, fallback = "/dashboard/lucrari"): string {
  return source === "dashboard" ? "/dashboard" : fallback
}
