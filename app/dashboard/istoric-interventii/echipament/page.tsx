"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { where } from "firebase/firestore"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ClampedText } from "@/components/history/clamped-text"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import type { Lucrare } from "@/lib/firebase/firestore"
import { formatUiDate } from "@/lib/utils/time-format"

type Row = {
  id: string
  nrLucrare: string
  dataInterventie: string
  locatie: string
  client: string
  echipamentCod: string
  echipament: string
  tehnicieni: string[]
  defectReclamat?: string
  constatareLaLocatie?: string
  descriereInterventie?: string
  durataInterventie?: string
}

const extractNr = (value?: string | null) => {
  const v = String(value || "")
  const m = v.match(/\d+/g)
  if (!m?.length) return Number.NEGATIVE_INFINITY
  const n = Number(m.join(""))
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY
}

export default function IstoricEchipamentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const codRaw = (searchParams.get("cod") || "").trim()
  const cod = codRaw.toUpperCase()

  // Folosim query simplu (raportGenerat=true) și filtrăm în memorie după cod,
  // pentru a evita probleme de index Firestore la combinații.
  const { data: works, loading } = useFirebaseCollection<Lucrare>("lucrari", [where("raportGenerat", "==", true)])

  const rows = useMemo<Row[]>(() => {
    if (!cod) return []
    const mapped = (works || [])
      .map((w: any) => {
        const echipamentCod = String(w.echipamentCod || "").trim()
        const echipament =
          String(
            [
              echipamentCod ? `(${echipamentCod})` : "",
              w.echipament || "",
            ]
              .filter(Boolean)
              .join(" "),
          ).trim() || String(w.echipament || "").trim()

        return {
          id: String(w.id),
          nrLucrare: String(w.nrLucrare || w.numarRaport || "").trim(),
          dataInterventie: String(w.dataInterventie || "").trim(),
          locatie: String(w.locationName || w.locatie || "").trim(),
          client: String(w.client || "").trim(),
          echipamentCod: echipamentCod.toUpperCase(),
          echipament,
          tehnicieni: Array.isArray(w.tehnicieni) ? w.tehnicieni : [],
          defectReclamat: w.defectReclamat,
          constatareLaLocatie: w.constatareLaLocatie,
          descriereInterventie: w.descriereInterventie,
          durataInterventie: String(w.durataInterventie || "").trim(),
        } as Row
      })
      .filter((r) => r.echipamentCod && r.echipamentCod === cod)

    mapped.sort((a, b) => extractNr(b.nrLucrare) - extractNr(a.nrLucrare))
    return mapped
  }, [works, cod])

  const equipmentHeaderLabel = useMemo(() => {
    if (!cod) return ""
    const first = String(rows?.[0]?.echipament || "").trim()
    if (!first) return cod
    // Evităm dublarea codului (de ex: "(ABC123) Nume" + "(ABC123)")
    if (first.toUpperCase().includes(cod)) return first
    return `${first} (${cod})`
  }, [cod, rows])

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Istoric echipament"
        text={
          cod
            ? `Intervenții pentru echipamentul: ${equipmentHeaderLabel || cod}`
            : "Introdu un cod de echipament pentru a vedea istoricul."
        }
      />

      <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Back în istoric; dacă nu există, revino la pagina listă.
            if (typeof window !== "undefined" && window.history.length > 1) router.back()
            else router.push("/dashboard/lucrari")
          }}
        >
          Înapoi la lucrări
        </Button>
        {cod ? (
          <div className="text-sm text-muted-foreground">
            {loading ? "Se încarcă..." : `${rows.length} intervenții găsite`}
          </div>
        ) : null}
      </div>

      {!cod ? (
        <Card className="border-gray-200 mt-3">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Lipsă cod. Deschide această pagină cu `?cod=...` (ex: din butonul „Vezi istoric”).
          </CardContent>
        </Card>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {rows.map((r) => (
            <Card key={r.id} className="border-gray-200">
              <CardHeader className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-gray-900">{r.nrLucrare || "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.dataInterventie ? formatUiDate(r.dataInterventie) : "-"}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.durataInterventie || "-"}</div>
                    </div>
                    <div className="mt-1 space-y-1">
                      <div className="text-sm text-gray-900">
                        <span className="font-medium">Client:</span> {r.client || "-"}
                      </div>
                      <div className="text-sm text-gray-900">
                        <span className="font-medium">Locație:</span> {r.locatie || "-"}
                      </div>
                      <div className="text-sm text-gray-900">
                        <span className="font-medium">Echipament:</span> {r.echipament || "-"}
                      </div>
                      <div className="text-sm text-gray-900">
                        <span className="font-medium">Tehnicieni:</span> {(r.tehnicieni || []).join(", ") || "-"}
                      </div>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={`/dashboard/lucrari/${r.id}`}>Vezi lucrarea</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Defect reclamat</div>
                    <ClampedText text={r.defectReclamat} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Constatare la locație</div>
                    <ClampedText text={r.constatareLaLocatie} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Intervenție</div>
                    <ClampedText text={r.descriereInterventie} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {!loading && rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nu există intervenții pentru codul {cod}.</div>
          ) : null}
        </div>
      )}
    </DashboardShell>
  )
}


