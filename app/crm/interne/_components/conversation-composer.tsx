"use client"

import { CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface ConversationComposerProps {
  canConfirm: boolean
  value: string
  loading: boolean
  onChange: (value: string) => void
  onConfirm: () => void
}

export function ConversationComposer({ canConfirm, value, loading, onChange, onConfirm }: ConversationComposerProps) {
  return (
    <div className="sticky bottom-0 mt-auto border-t border-neutral-200 bg-white px-6 py-3">
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-3.5">
        <Label htmlFor="internal-confirmation-message" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          Răspuns confirmare
        </Label>
        <Textarea
          id="internal-confirmation-message"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          placeholder="Ex: Confirm primirea sumei cash."
          className="mt-2 min-h-[72px] rounded-xl border-neutral-200 bg-white px-3.5 py-2.5"
          disabled={!canConfirm}
        />
        <div className="mt-2.5 flex items-end justify-between gap-3">
          <p className="max-w-[560px] text-xs leading-5 text-neutral-500">
            Confirmarea marchează conversația ca rezolvată în fluxul intern și oferă context clar pentru verificări ulterioare.
          </p>
          <Button type="button" onClick={onConfirm} disabled={!canConfirm || loading} className="h-9 rounded-lg px-3.5">
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Confirmă
          </Button>
        </div>
      </div>
    </div>
  )
}
