type OfferEmailWork = {
  nrLucrare?: string
  numarRaport?: string
  echipament?: string
  locatie?: string
}

const clean = (value: string | undefined) => (value || "").replace(/\s+/g, " ").trim()

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!)
}

export function buildOfferEmailContent(work: OfferEmailWork) {
  const label = [clean(work.nrLucrare) || clean(work.numarRaport), clean(work.echipament), clean(work.locatie)]
    .filter(Boolean)
    .join(" — ")
  const subject = label ? `Ofertă pentru tichetul ${label}` : "Ofertă pentru tichet"
  const introduction = `În vederea finalizării tichetului${label ? ` ${label}` : ""} am constatat că sunt necesare următoarele echipamente și servicii:`

  return { subject, headingHtml: escapeHtml(subject), introductionHtml: escapeHtml(introduction) }
}
