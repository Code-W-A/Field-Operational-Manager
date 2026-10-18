"use client"

import { useEffect, useState } from "react"
import { subscribeRevisionsForWork, type EquipmentRevisionDoc } from "@/lib/firebase/revisions"

export function useRevisionCardNotes(workId: string, workType: string | undefined, role: string | undefined) {
  const enabled = workType === "Revizie" && ["admin", "dispecer", "tehnician"].includes(role || "")
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    workId: string; attempt: number; sheets: Record<string, EquipmentRevisionDoc>; error: boolean
  } | null>(null)

  useEffect(() => {
    if (!enabled || !workId) { setState(null); return }
    let active = true
    const stop = subscribeRevisionsForWork(workId,
      sheets => { if (active) setState({ workId, attempt, sheets, error: false }) },
      () => { if (active) setState({ workId, attempt, sheets: {}, error: true }) },
    )
    return () => { active = false; stop() }
  }, [workId, enabled, attempt])

  const current = enabled && state?.workId === workId && state.attempt === attempt ? state : null
  return {
    enabled,
    sheets: current?.sheets || {},
    loading: enabled && !current,
    error: current?.error || false,
    retry: () => setAttempt(value => value + 1),
  }
}
