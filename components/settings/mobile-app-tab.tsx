"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DEFAULT_POLICY, parsePolicy, type AndroidUpdatePolicy } from "@/lib/mobile-update/policy"

export function MobileAppTab() {
  const { user } = useAuth()
  const [policy, setPolicy] = useState<AndroidUpdatePolicy>(DEFAULT_POLICY)
  const [build, setBuild] = useState("1")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    setLoading(true)
    setLoaded(false)
    setError("")
    async function load() {
      try {
        const token = await user?.getIdToken()
        const response = await fetch("/api/admin/mobile-update-policy", {
          cache: "no-store", signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Citirea setărilor a eșuat.")
        const parsed = parsePolicy(data)
        if (!parsed) throw new Error("Configurația primită este invalidă.")
        if (controller.signal.aborted) return
        setPolicy(parsed)
        setBuild(String(parsed.minimumAndroidVersionCode))
        setLoaded(true)
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Citirea setărilor a eșuat.")
      } finally {
        clearTimeout(timer)
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    // A timeout must leave the form available for a retry, never for an accidental save.
    controller.signal.addEventListener("abort", () => {
      if (!disposed) { setError("Citirea setărilor a expirat. Reîncearcă."); setLoading(false) }
    })
    let disposed = false
    void load()
    return () => { disposed = true; clearTimeout(timer); controller.abort() }
  }, [user, retry])

  async function save() {
    setError("")
    setNotice("")
    const value = /^\d+$/.test(build) ? Number(build) : NaN
    const parsed = parsePolicy({ ...policy, minimumAndroidVersionCode: value })
    if (!parsed) { setError("Introdu un build întreg între 1 și 2100000000 și un mesaj de maximum 500 de caractere."); return }
    setSaving(true)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const token = await user?.getIdToken()
      const response = await fetch("/api/admin/mobile-update-policy", {
        method: "PUT", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(parsed),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Salvarea a eșuat.")
      setPolicy(parsed)
      setNotice("Setările au fost salvate.")
    } catch (e) {
      setError(controller.signal.aborted ? "Salvarea a expirat. Reîncarcă setările pentru a verifica rezultatul." : e instanceof Error ? e.message : "Salvarea a eșuat.")
    } finally { clearTimeout(timer); setSaving(false) }
  }

  return <Card>
    <CardHeader>
      <CardTitle>Actualizarea aplicației Android</CardTitle>
      <CardDescription>Activează obligativitatea numai după ce noul build este disponibil utilizatorilor în Google Play.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <fieldset disabled={loading || saving || !loaded} className="space-y-5 disabled:opacity-60">
        <div className="flex items-center gap-3">
          <Switch id="mobile-update-enabled" checked={policy.enabled} onCheckedChange={enabled => setPolicy(p => ({ ...p, enabled }))} />
          <Label htmlFor="mobile-update-enabled">Actualizare obligatorie Android</Label>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mobile-update-build">Build minim acceptat (versionCode)</Label>
          <Input id="mobile-update-build" type="number" min={1} max={2100000000} step={1} value={build} onChange={e => setBuild(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mobile-update-message">Mesaj</Label>
          <Textarea id="mobile-update-message" maxLength={500} value={policy.message} onChange={e => setPolicy(p => ({ ...p, message: e.target.value }))} />
        </div>
        <Button type="button" onClick={() => void save()}>{saving ? "Se salvează…" : "Salvează"}</Button>
      </fieldset>
      {loading && <p role="status">Se încarcă setările…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <Button type="button" variant="outline" disabled={loading || saving} onClick={() => { setNotice(""); setRetry(n => n + 1) }}>Reîncarcă setările</Button>
      <p className="text-sm text-muted-foreground">Salvarea nu publică o versiune nouă. Instalările care nu conțin mecanismul de actualizare nu pot afișa modalul.</p>
    </CardContent>
  </Card>
}
