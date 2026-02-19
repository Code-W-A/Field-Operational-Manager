"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ClampedText } from "@/components/history/clamped-text"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import type { Lucrare } from "@/lib/firebase/firestore"
import { formatUiDate } from "@/lib/utils/time-format"
import { useAuth } from "@/contexts/AuthContext"
import { db } from "@/lib/firebase/config"

type Row = {
  id: string
  source: "lucrari"
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

function TechnicianHistoryCard({ r }: { r: Row }) {
  const data = r.dataInterventie ? formatUiDate(r.dataInterventie) : "-"
  const ore = r.durataInterventie || "-"
  const echipament = r.echipament || "-"
  const locatie = r.locatie || "-"
  const tehnicieni = (r.tehnicieni || []).length ? r.tehnicieni : ["-"]

  return (
    <Card className="border-gray-200">
      <CardContent className="p-0">
        <div className="border border-gray-300">
          {/* Row 1: Nr. Lucrare + Data */}
          <div className="grid grid-cols-2 border-b border-gray-300">
            <div className="border-r border-gray-300 p-3">
              <div className="font-semibold text-gray-900">Nr. Tichet:</div>
              <div className="mt-1 text-gray-900">{r.nrLucrare || "-"}</div>
            </div>
            <div className="p-3 text-right">
              <div className="font-semibold text-gray-900">Data</div>
              <div className="mt-1 text-gray-900">{data}</div>
            </div>
          </div>

          {/* Row 2: Locatie + Echipament */}
          <div className="grid grid-cols-2 border-b border-gray-300">
            <div className="border-r border-gray-300 p-3">
              <div className="font-semibold text-gray-900">Locatie:</div>
              <div className="mt-1 text-gray-900">{locatie}</div>
            </div>
            <div className="p-3 text-right">
              <div className="font-semibold text-gray-900">Echipament:</div>
              <div className="mt-1 text-gray-900 text-left sm:text-right">{echipament}</div>
            </div>
          </div>

          {/* Defect */}
          <div className="border-b border-gray-300 p-3">
            <div className="font-semibold text-gray-900">Defect reclamat:</div>
            <div className="mt-1 text-gray-900 whitespace-pre-wrap">{r.defectReclamat || "-"}</div>
          </div>

          {/* Constatare */}
          <div className="border-b border-gray-300 p-3">
            <div className="font-semibold text-gray-900">Constatare la locatie:</div>
            <div className="mt-1 text-gray-900 whitespace-pre-wrap">{r.constatareLaLocatie || "-"}</div>
          </div>

          {/* Interventie */}
          <div className="border-b border-gray-300 p-3">
            <div className="font-semibold text-gray-900">Interventie:</div>
            <div className="mt-1 text-gray-900 whitespace-pre-wrap">{r.descriereInterventie || "-"}</div>
          </div>

          {/* Tehnician + Ore */}
          <div className="grid grid-cols-2 border-b border-gray-300">
            <div className="border-r border-gray-300 p-3">
              <div className="font-semibold text-gray-900">Tehnician:</div>
              <div className="mt-1 space-y-0.5 text-gray-900">
                {tehnicieni.map((t, idx) => (
                  <div key={`${t}-${idx}`}>{t}</div>
                ))}
              </div>
            </div>
            <div className="p-3 text-right">
              <div className="font-semibold text-gray-900">Ore lucrate:</div>
              <div className="mt-1 text-gray-900">{ore}</div>
            </div>
          </div>

          {/* Link */}
          <div className="p-3 text-center">
            <Link
              href={`/dashboard/lucrari/${r.id}?from=istoric-echipament`}
              className="text-blue-700 underline font-medium"
            >
              Vezi lucrarea
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function IstoricEchipamentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const codRaw = (searchParams.get("cod") || "").trim()
  const cod = codRaw.toUpperCase()
  const { userData } = useAuth()
  const isTechnician = userData?.role === "tehnician"
  const lastLogKeyRef = useRef<string>("")
  const [fallbackWorks, setFallbackWorks] = useState<any[] | null>(null)
  const [fallbackLoading, setFallbackLoading] = useState(false)

  // Istoricul se caută după `echipamentCod`.
  // Colecția reală pentru work orders este `lucrari` (UI poate afișa "tichet", dar storage rămâne `lucrari`).
  // Folosim `customQuery` (nu `constraints`) ca să ne asigurăm că se resubscrie când se schimbă codul.
  const codForQuery = cod || "__NO_MATCH__"
  const qLucrari = useMemo(
    () => query(collection(db, "lucrari"), where("echipamentCod", "==", codForQuery)),
    [codForQuery],
  )

  const { data: worksLucrari, loading: loadingLucrari } = useFirebaseCollection<Lucrare>("lucrari", [], qLucrari)
  const loading = loadingLucrari

  useEffect(() => {
    // Log once per (cod, loading, count) tuple to avoid spam
    const key = `${cod}|${loading ? "loading" : "ready"}|${worksLucrari?.length || 0}`
    if (key === lastLogKeyRef.current) return
    lastLogKeyRef.current = key

    console.log("[ISTORIC_ECHIP] page state", {
      codRaw,
      cod,
      codForQuery,
      loading,
      worksCount: worksLucrari?.length || 0,
      role: userData?.role || null,
    })

    if (!loading && cod) {
      const sample = (worksLucrari || []).slice(0, 8).map((w: any) => ({
        id: w?.id,
        echipamentCod: String(w?.echipamentCod || ""),
        nrLucrare: String(w?.nrLucrare || w?.numarRaport || ""),
        raportGenerat: Boolean(w?.raportGenerat),
      }))
      console.log(`[ISTORIC_ECHIP] sample docs for cod=${cod}`, sample)

      if ((worksLucrari || []).length === 0) {
        console.warn("[ISTORIC_ECHIP] 0 matches from Firestore query", {
          collection: "lucrari",
          where: { echipamentCod: cod },
          hint:
            "Dacă știi sigur că există istoric, cel mai probabil lucrările vechi NU au câmpul `echipamentCod` setat sau au alt format (spații/litere mici).",
        })
      }
    }
  }, [codRaw, cod, codForQuery, loading, worksLucrari, userData?.role])

  const normalize = (v: unknown) =>
    String(v ?? "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, "")
      .trim()

  const deriveEquipmentCode = (w: any): { code: string; source: string } => {
    const direct = String(w?.echipamentCod || "").trim()
    if (direct) return { code: direct, source: "echipamentCod" }

    const ci = w?.clientInfo || {}
    const ciCode = String(ci?.echipamentCod || ci?.equipmentCode || ci?.codEchipament || "").trim()
    if (ciCode) return { code: ciCode, source: "clientInfo.*cod" }

    const text = String(w?.echipament || "").trim()
    // Try "(CODE)" pattern
    const m = text.match(/\(([A-Za-z0-9]{2,10})\)/)
    if (m?.[1]) return { code: m[1], source: "echipament(text:(CODE))" }

    // Last resort: find any token that looks like equipment code (contains letters+digits, max 10)
    const tokens = text.split(/[\s,;:/\\|]+/g).map((t) => t.trim()).filter(Boolean)
    const candidate = tokens.find((t) => t.length <= 10 && /[A-Za-z]/.test(t) && /[0-9]/.test(t))
    if (candidate) return { code: candidate, source: "echipament(text:token)" }

    return { code: "", source: "none" }
  }

  // Fallback scan: if strict query returns 0, scan recent works and match by derived code.
  useEffect(() => {
    if (!cod) return
    if (loading) return
    if ((worksLucrari || []).length > 0) {
      // We have strict matches; clear fallback to avoid mixing sources.
      if (fallbackWorks) setFallbackWorks(null)
      return
    }

    const codN = normalize(cod)
    if (!codN) return

    let cancelled = false
    setFallbackLoading(true)
    ;(async () => {
      const SAMPLE = 2000
      console.log(`[ISTORIC_ECHIP] fallbackScan start for cod=${cod} (sample=${SAMPLE})`)
      try {
        const q = query(collection(db, "lucrari"), orderBy("updatedAt", "desc"), limit(SAMPLE))
        const snap = await getDocs(q)
        if (cancelled) return
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

        const hits = docs.filter((w: any) => {
          const { code } = deriveEquipmentCode(w)
          return normalize(code) === codN
        })

        const sampleHits = hits.slice(0, 10).map((w: any) => {
          const derived = deriveEquipmentCode(w)
          return {
            id: w?.id,
            nrLucrare: String(w?.nrLucrare || w?.numarRaport || ""),
            echipamentCod: String(w?.echipamentCod || ""),
            derivedCode: derived.code,
            derivedFrom: derived.source,
            echipament: String(w?.echipament || ""),
          }
        })

        console.warn(`[ISTORIC_ECHIP] fallbackScan results for cod=${cod}`, {
          sampled: docs.length,
          hits: hits.length,
          sample: sampleHits,
          hint:
            hits.length > 0
              ? "Aha: există lucrări care corespund, dar `echipamentCod` lipsește/nu e completat. Recomand backfill/migrare pentru câmpul `echipamentCod`."
              : "Nicio potrivire în eșantion. Ori codul e diferit, ori lucrarea e prea veche (în afara eșantionului).",
        })

        setFallbackWorks(hits)
      } catch (e) {
        if (cancelled) return
        console.warn(`[ISTORIC_ECHIP] fallbackScan failed for cod=${cod}`, e)
        setFallbackWorks([])
      } finally {
        if (cancelled) return
        setFallbackLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cod, loading, worksLucrari, fallbackWorks])

  const rows = useMemo<Row[]>(() => {
    if (!cod) return []
    const sourceWorks = (worksLucrari && worksLucrari.length > 0) ? worksLucrari : (fallbackWorks || [])
    const mappedLucrari = (sourceWorks || []).map((w: any) => {
        const derived = deriveEquipmentCode(w)
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
        source: "lucrari" as const,
          nrLucrare: String(w.nrLucrare || w.numarRaport || "").trim(),
          dataInterventie: String(w.dataInterventie || "").trim(),
          locatie: String(w.locationName || w.locatie || "").trim(),
          client: String(w.client || "").trim(),
          echipamentCod: (echipamentCod || derived.code || "").toUpperCase(),
          echipament,
          tehnicieni: Array.isArray(w.tehnicieni) ? w.tehnicieni : [],
          defectReclamat: w.defectReclamat,
          constatareLaLocatie: w.constatareLaLocatie,
          descriereInterventie: w.descriereInterventie,
          durataInterventie: String(w.durataInterventie || "").trim(),
        } as Row
      })

    const out = [...mappedLucrari].filter((r) => r.echipamentCod && r.echipamentCod === cod)
    out.sort((a, b) => extractNr(b.nrLucrare) - extractNr(a.nrLucrare))
    return out
  }, [worksLucrari, fallbackWorks, cod])

  useEffect(() => {
    if (!cod) return
    if (loading) return
    console.log("[ISTORIC_ECHIP] computed rows", {
      cod,
      rowsCount: rows.length,
      firstRow: rows[0] ? { id: rows[0].id, nrLucrare: rows[0].nrLucrare, echipamentCod: rows[0].echipamentCod } : null,
      usedFallback: (worksLucrari || []).length === 0 && (fallbackWorks || []).length > 0,
      fallbackLoading,
    })
  }, [cod, loading, rows, worksLucrari, fallbackWorks, fallbackLoading])

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
        <div className="mt-3 grid grid-cols-1 gap-3 pb-8">
          {rows.map((r) => (
            isTechnician ? (
              <TechnicianHistoryCard key={r.id} r={r} />
            ) : (
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
                      <Link href={`/dashboard/lucrari/${r.id}?from=istoric-echipament`}>Vezi lucrarea</Link>
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
            )
          ))}

          {!loading && rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nu există intervenții pentru codul {cod}.</div>
          ) : null}
        </div>
      )}
    </DashboardShell>
  )
}

