"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

export default function PontajRedirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    router.replace(`/dashboard/resurse-umane/condica-prezenta${qs ? `?${qs}` : ""}`)
  }, [router, searchParams])

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Se deschide condica de prezență...</p>
    </main>
  )
}
