import type { EquipmentRevisionDoc } from "@/packages/fom-domain/revision"

export function RevisionCardNotes({ sheet }: { sheet?: EquipmentRevisionDoc }) {
  const checks = (sheet?.sections || []).flatMap((section, sectionIndex) =>
    (section.items || []).flatMap((item, itemIndex) =>
      typeof item.obs === "string" && item.obs.trim()
        ? [{ key: `${sectionIndex}:${itemIndex}`, section: section.title || section.name,
            label: item.label || item.name, text: item.obs }]
        : [],
    ),
  )
  const final = typeof sheet?.finalObservations === "string" ? sheet.finalObservations : ""
  if (!checks.length && !final.trim()) return null

  return (
    <div className="mb-4 min-w-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 space-y-3" aria-label="Observații fișă de revizie">
      {checks.length > 0 && (
        <div>
          <h5 className="font-semibold mb-2">Observații la verificări</h5>
          <ul className="space-y-3">
            {checks.map(check => (
              <li key={check.key} className="min-w-0 break-words [overflow-wrap:anywhere]">
                <p className="font-medium">{[check.section, check.label].filter(Boolean).join(" / ")}</p>
                <p className="whitespace-pre-wrap">{check.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {final.trim() && (
        <div className="break-words [overflow-wrap:anywhere]">
          <h5 className="font-semibold mb-1">Observații finale</h5>
          <p className="whitespace-pre-wrap">{final}</p>
        </div>
      )}
    </div>
  )
}
