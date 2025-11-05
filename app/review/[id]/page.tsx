"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()

  const preselect = useMemo(() => {
    const r = Number(search.get("r"))
    return Number.isFinite(r) ? Math.max(1, Math.min(5, r)) : null
  }, [search])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [client, setClient] = useState<string>("")
  const [location, setLocation] = useState<string>("")
  const [techs, setTechs] = useState<string>("")
  const [rating, setRating] = useState<number | null>(preselect)
  const [review, setReview] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        if (!id) return
        const w: any = await getLucrareById(String(id))
        if (!mounted || !w) return
        setClient(w.client || "Client")
        setLocation(w.locatie || "Locație")
        setTechs(Array.isArray(w.tehnicieni) ? w.tehnicieni.join(", ") : (w.tehnicieni || ""))
        if (typeof w.clientRating === 'number' && w.clientRating >= 1 && w.clientRating <= 5) {
          setRating(w.clientRating)
        }
        if (typeof w.clientReview === 'string') setReview(w.clientReview)
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => { mounted = false }
  }, [id])

  const submit = async () => {
    if (!id || !rating) return
    setSaving(true)
    try {
      await updateLucrare(String(id), {
        clientRating: Math.max(1, Math.min(5, rating)),
        clientReview: review?.trim() || "",
      } as any)
      setDone(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Mulțumim pentru feedback!</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Feedback-ul a fost înregistrat pentru lucrarea {String(id)}.</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => router.push("/")}>Închide</Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Acordă recenzie pentru tehnician</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-2">
            {client} — {location} — {techs}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">Acorda recenzie pentru tehnician:</span>
            <div className="flex items-center gap-1 text-2xl select-none">
              {[1,2,3,4,5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} stele`}
                  className={`leading-none ${rating && n <= rating ? 'text-yellow-500' : 'text-gray-300'} hover:text-yellow-500`}
                  onClick={() => setRating(n)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <Textarea
            placeholder="Scrie un comentariu (opțional)"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
        </CardContent>
        <CardFooter className="justify-between">
          <Button variant="outline" onClick={() => router.push("/")}>Anulează</Button>
          <Button disabled={!rating || saving} onClick={submit}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Se salvează...</> : "Trimite feedback"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}


