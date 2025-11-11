"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Setting } from "@/types/settings"
import { subscribeToSettings, subscribeToSettingsByTarget } from "@/lib/firebase/settings"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { ChevronsUpDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface DynamicDialogFieldsProps {
  targetId: string
  values: Record<string, any> | undefined
  onChange: (fieldKey: string, value: any) => void
  className?: string
}

export function DynamicDialogFields({ targetId, values, onChange, className = "" }: DynamicDialogFieldsProps) {
  const [parents, setParents] = useState<Setting[]>([])
  const [childrenByParent, setChildrenByParent] = useState<Record<string, Setting[]>>({})
  const childUnsubsRef = useRef<Record<string, () => void>>({})

  useEffect(() => {
    // cleanup on target change
    Object.values(childUnsubsRef.current).forEach((u) => u && u())
    childUnsubsRef.current = {}
    setChildrenByParent({})
    setParents([])

    const unsubParents = subscribeToSettingsByTarget(targetId, (ps) => {
      setParents(ps)
      // unsubscribe removed
      const current = new Set(ps.map((p) => p.id))
      for (const pid of Object.keys(childUnsubsRef.current)) {
        if (!current.has(pid)) {
          childUnsubsRef.current[pid]!()
          delete childUnsubsRef.current[pid]
        }
      }
      // subscribe new
      ps.forEach((p) => {
        if (childUnsubsRef.current[p.id]) return
        childUnsubsRef.current[p.id] = subscribeToSettings(p.id, (children) => {
          setChildrenByParent((prev) => ({ ...prev, [p.id]: children }))
        })
      })
    })
    return () => {
      unsubParents()
      Object.values(childUnsubsRef.current).forEach((u) => u && u())
      childUnsubsRef.current = {}
    }
  }, [targetId])

  const visibleParents = useMemo(
    () => parents.filter((p) => (childrenByParent[p.id]?.length || 0) > 0),
    [parents, childrenByParent],
  )

  if (!visibleParents.length) return null

  return (
    <div className={className}>
      <div className="mb-2">
        <Label className="text-xs text-muted-foreground">Câmpuri din setări (legate de acest dialog)</Label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleParents.map((p) => {
          const options = (childrenByParent[p.id] || [])
            .map((c) => c?.name || "")
            .filter((s) => String(s || "").trim().length > 0)
          if (!options.length) return null
          const current = values?.[p.id] ?? ""
          const [open, setOpen] = [undefined, undefined] as unknown as [boolean, (o: boolean) => void] // satisfy TS in map
          return (
            <FieldWithSearch
              key={p.id}
              id={p.id}
              label={p.name}
              value={String(current || "")}
              options={options}
              onChange={(val) => onChange(p.id, val)}
            />
          )
        })}
      </div>
    </div>
  )
}

function FieldWithSearch({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  onChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel = value && options.includes(value) ? value : ""

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between")}
          >
            <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
              {selectedLabel || `Selectați ${label.toLowerCase()}`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-w-[90vw]">
          <Command shouldFilter={true}>
            <CommandInput placeholder={`Căutare ${label.toLowerCase()}...`} />
            <CommandEmpty>Nu s-au găsit rezultate.</CommandEmpty>
            <CommandList className="max-h-[240px] overflow-auto">
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => {
                      onChange(opt)
                      setOpen(false)
                    }}
                    className="whitespace-nowrap"
                  >
                    <Check className={cn("mr-2 h-4 w-4", opt === value ? "opacity-100" : "opacity-0")} />
                    <span className="inline-block min-w-max">{opt}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}


