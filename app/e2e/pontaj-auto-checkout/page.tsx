"use client"

import { useMemo } from "react"
import { isE2eTestMode } from "@/lib/utils/environment"
import { technicianHasUnfinishedWorkToday } from "@/lib/attendance/remaining-work"
import { buildRemainingWorkScenarios } from "@/lib/attendance/e2e-fixtures"

/**
 * Harness E2E (doar în NEXT_PUBLIC_E2E_TEST_MODE) pentru regula de depontare automată la raport semnat.
 * Rulează helper-ul pur pe fixturi deterministe și afișează decizia + textul vizibil utilizatorului,
 * astfel încât Playwright să verifice exact comportamentul „depontează doar la ultima lucrare a zilei”.
 */
export default function PontajAutoCheckoutHarness() {
  const enabled = isE2eTestMode()
  const scenarios = useMemo(() => buildRemainingWorkScenarios(Date.now()), [])

  if (!enabled) {
    return <div data-testid="harness-disabled">Harness indisponibil în afara E2E.</div>
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 data-testid="harness-title">Pontaj — depontare automată la raport semnat</h1>
      <ul>
        {scenarios.map((s) => {
          const blocked = technicianHasUnfinishedWorkToday(s.tickets, s.nowMs)
          const decision = blocked ? "blocked" : "allowed"
          const userMessage = blocked
            ? "Depontare automată amânată: tehnicianul mai are lucrări neterminate azi."
            : "Depontare automată: pontajul a fost oprit după raportul semnat de beneficiar."
          return (
            <li key={s.id} data-testid={`scenario-${s.id}`} style={{ marginBottom: 16 }}>
              <div>{s.label}</div>
              <div data-testid={`decision-${s.id}`}>{decision}</div>
              <div data-testid={`message-${s.id}`}>{userMessage}</div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
