"use client"

import { useState } from "react"
import { CalendarClock, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { getDateValue } from "@/lib/crm/activity"
import { updateCrmTask } from "@/lib/crm/tasks"
import {
  computePostponedDueAt,
  TASK_POSTPONE_LABELS,
  TASK_POSTPONE_PRESETS,
  type TaskPostponePreset,
} from "@/lib/crm/task-postpone"
import type { CrmTask } from "@/lib/crm/types"

function toDateTimeLocal(value: Date) {
  const yyyy = value.getFullYear()
  const mm = String(value.getMonth() + 1).padStart(2, "0")
  const dd = String(value.getDate()).padStart(2, "0")
  const hh = String(value.getHours()).padStart(2, "0")
  const min = String(value.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function isOpenCrmTask(task: CrmTask) {
  return task.status === "TODO" || task.status === "IN_PROGRESS"
}

export type TaskPostponeMenuProps = {
  task: CrmTask
  actorId: string
  disabled?: boolean
  onSuccess?: () => void | Promise<void>
}

export function TaskPostponeMenu({ task, actorId, disabled, onSuccess }: TaskPostponeMenuProps) {
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState("")
  const [busy, setBusy] = useState(false)

  const currentDue = getDateValue(task.dueAt)
  const eligible = isOpenCrmTask(task) && Boolean(currentDue)

  const runPostpone = async (dueAt: Date) => {
    if (!actorId) return
    setBusy(true)
    try {
      await updateCrmTask({
        taskId: task.id,
        actorId,
        dueAt,
      })
      toast({
        title: "Termen actualizat",
        description: "Sarcina a fost amânată.",
      })
      setMenuOpen(false)
      setCustomOpen(false)
      await onSuccess?.()
    } catch (error) {
      toast({
        title: "Nu am putut amâna",
        description: error instanceof Error ? error.message : "Încearcă din nou.",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const openCustom = () => {
    setCustomValue(toDateTimeLocal(currentDue))
    setMenuOpen(false)
    setCustomOpen(true)
  }

  const saveCustom = async () => {
    if (!customValue.trim()) return
    const parsed = new Date(customValue)
    if (Number.isNaN(parsed.getTime())) {
      toast({
        title: "Dată invalidă",
        description: "Verifică data și ora.",
        variant: "destructive",
      })
      return
    }
    await runPostpone(parsed)
  }

  const onPreset = async (preset: TaskPostponePreset) => {
    if (!currentDue) return
    await runPostpone(computePostponedDueAt(currentDue, preset))
  }

  if (!eligible || !currentDue) return null

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-sm"
            disabled={disabled || busy}
            aria-label="Amână sarcina"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Amână
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {TASK_POSTPONE_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset}
              disabled={busy}
              onSelect={(e) => {
                e.preventDefault()
                void onPreset(preset)
              }}
            >
              {TASK_POSTPONE_LABELS[preset]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={busy}
            onSelect={(e) => {
              e.preventDefault()
              openCustom()
            }}
          >
            Alt termen…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Amână sarcina</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="crm-task-postpone-custom">Termen nou</Label>
            <Input
              id="crm-task-postpone-custom"
              type="datetime-local"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomOpen(false)} disabled={busy}>
              Anulează
            </Button>
            <Button type="button" onClick={() => void saveCustom()} disabled={busy}>
              {busy ? "Se salvează…" : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
