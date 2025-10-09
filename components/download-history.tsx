"use client"

import { useEffect, useState } from "react"
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore"
import { db } from "@/lib/firebase/config"

export function DownloadHistory({ lucrareId, locationEmail }: { lucrareId: string, locationEmail?: string }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [derivedLocationEmail, setDerivedLocationEmail] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, "lucrari", lucrareId, "downloads"), orderBy("timestamp", "desc"))
        const snap = await getDocs(q)
        const list: any[] = []
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
        setItems(list)

        // Derivăm emailul persoanei de contact a locației doar dacă nu este furnizat de părinte
        if (!locationEmail) {
          try {
            const workRef = doc(db, "lucrari", lucrareId)
            const workSnap = await getDoc(workRef)
            const work = workSnap.exists() ? (workSnap.data() as any) : null
            const clientId = work?.clientInfo?.id
            if (clientId) {
              const clientRef = doc(db, "clienti", String(clientId))
              const clientSnap = await getDoc(clientRef)
              const client = clientSnap.exists() ? (clientSnap.data() as any) : null
              const isValid = (e?: string) => !!e && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(String(e || ''))
              const norm = (s?: string) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
              const matches = (a?: string, b?: string) => {
                const na = norm(a); const nb = norm(b)
                if (!na || !nb) return false
                return na === nb || na.includes(nb) || nb.includes(na)
              }
              const locatii: any[] = Array.isArray(client?.locatii) ? client.locatii : []
              const targetId = work?.clientInfo?.locationId || work?.clientInfo?.locatieId
              const targetName = work?.locatie || work?.clientInfo?.locationName
              const targetAddr = work?.clientInfo?.locationAddress
              const targetContactName = work?.persoanaContact
              let loc = targetId ? locatii.find((l: any) => String(l?.id || '') === String(targetId)) : undefined
              if (!loc) {
                loc = locatii.find((l: any) => matches(l?.nume, targetName) || matches(l?.adresa, targetAddr))
              }
              if (loc) {
                const persoane: any[] = Array.isArray(loc?.persoaneContact) ? loc.persoaneContact : []
                const exact = persoane.find((c: any) => matches(c?.nume, targetContactName))
                if (isValid(exact?.email)) setDerivedLocationEmail(String(exact.email))
                else if (isValid(loc?.email)) setDerivedLocationEmail(String(loc.email))
                else {
                  const anyContact = persoane.find((c: any) => isValid(c?.email))
                  if (isValid(anyContact?.email)) setDerivedLocationEmail(String(anyContact.email))
                }
              }
            }
          } catch {}
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lucrareId, locationEmail])

  if (loading) return <div className="text-sm text-muted-foreground">Se încarcă...</div>
  if (!items.length) return <div className="text-sm text-muted-foreground">Nu există descărcări înregistrate.</div>

  return (
    <div className="rounded border bg-white">
      <div className="divide-y">
        {items.map((it) => {
          const d = it.timestamp?.toDate ? it.timestamp.toDate() : it.timestamp ? new Date(it.timestamp) : null
          const when = d ? `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` : "-"
          const who = (it.userEmail && it.userEmail !== "portal") ? it.userEmail : (locationEmail || derivedLocationEmail || "Portal client")
          return (
            <div key={it.id} className="p-2 text-sm flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{it.type || "document"}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-muted-foreground truncate max-w-[38ch]" title={it.url}>{it.url}</span>
                </div>
                <div className="text-xs text-muted-foreground">de: {who}</div>
              </div>
              <div className="text-muted-foreground whitespace-nowrap ml-4">{when}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


