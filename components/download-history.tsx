"use client"

import { useEffect, useState } from "react"
import { collection, getDocs, orderBy, query } from "firebase/firestore"
import { db } from "@/lib/firebase/config"

export function DownloadHistory({ lucrareId }: { lucrareId: string }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, "lucrari", lucrareId, "downloads"), orderBy("timestamp", "desc"))
        const snap = await getDocs(q)
        const list: any[] = []
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
        setItems(list)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lucrareId])

  if (loading) return <div className="text-sm text-muted-foreground">Se încarcă...</div>
  if (!items.length) return <div className="text-sm text-muted-foreground">Nu există descărcări înregistrate.</div>

  return (
    <div className="rounded border bg-white">
      <div className="divide-y">
        {items.map((it) => {
          const d = it.timestamp?.toDate ? it.timestamp.toDate() : it.timestamp ? new Date(it.timestamp) : null
          const when = d ? `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` : "-"
          const who = (it.userEmail && it.userEmail !== "portal") ? it.userEmail : "Portal client"
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


