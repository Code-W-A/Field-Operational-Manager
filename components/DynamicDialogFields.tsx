"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Setting } from "@/types/settings"
import { subscribeToSettings, subscribeToSettingsByTarget } from "@/lib/firebase/settings"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
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
import { ChevronsUpDown, Check, Image as ImageIcon, FileText, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"

interface DynamicDialogFieldsProps {
  targetId: string
  values: Record<string, any> | undefined
  onChange: (fieldKey: string, value: any) => void
  className?: string
  onSettingSelected?: (fieldKey: string, setting: Setting | undefined, parentName: string) => void
  enableNumericEdit?: boolean
  onSelectedSettingNumericChange?: (fieldKey: string, parentName: string, setting: Setting | undefined, newValue: number | null) => void
  filterChild?: (child: Setting, parentName: string) => boolean
}

export function DynamicDialogFields({ targetId, values, onChange, className = "", onSettingSelected, enableNumericEdit = false, onSelectedSettingNumericChange, filterChild }: DynamicDialogFieldsProps) {
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

  // Determinăm dacă avem un singur element pentru a-l face full-width
  const isSingleElement = visibleParents.length === 1

  return (
    <div className={className}>
      <div className="mb-2">
        <Label className="text-xs text-muted-foreground">Câmpuri din setări (legate de acest dialog)</Label>
      </div>
      <div className={cn(
        "grid gap-3",
        isSingleElement ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
      )}>
        {visibleParents.map((p, index) => {
          const children = childrenByParent[p.id] || []
          const filteredChildren = filterChild ? children.filter((c) => filterChild(c, p.name)) : children
          const options = filteredChildren
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
              children={filteredChildren}
              onChange={(val) => onChange(p.id, val)}
              onSettingSelected={(setting) => onSettingSelected && onSettingSelected(p.id, setting, p.name)}
              enableNumericEdit={enableNumericEdit}
              onSelectedSettingNumericChange={(setting, newValue) => onSelectedSettingNumericChange && onSelectedSettingNumericChange(p.id, p.name, setting, newValue)}
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
  children,
  onChange,
  onSettingSelected,
  enableNumericEdit,
  onSelectedSettingNumericChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  children: Setting[]
  onChange: (val: string) => void
  onSettingSelected?: (setting: Setting | undefined, parentName: string) => void
  enableNumericEdit?: boolean
  onSelectedSettingNumericChange?: (setting: Setting | undefined, newValue: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel = value && options.includes(value) ? value : ""
  
  // Găsim setarea selectată pentru a afișa datele suplimentare
  const selectedSetting = children.find((c) => c.name === value)
  const [numericText, setNumericText] = useState<string>(selectedSetting?.numericValue !== undefined && selectedSetting?.numericValue !== null ? String(selectedSetting.numericValue) : "")

  // Sincronizează câmpul numeric când se schimbă selecția
  useEffect(() => {
    const initial = selectedSetting?.numericValue
    setNumericText(initial !== undefined && initial !== null ? String(initial) : "")
  }, [selectedSetting?.id])

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
                      const sel = children.find((c) => c.name === opt)
                      onSettingSelected && onSettingSelected(sel, label)
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

      {/* Afișăm datele suplimentare pentru opțiunea selectată */}
      {selectedSetting && (
        <div className="mt-2 space-y-2 p-3 bg-muted/30 rounded-md border">
          {/* Valoare numerică */}
          {(selectedSetting.numericValue !== undefined && selectedSetting.numericValue !== null) && !enableNumericEdit && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Valoare:</span>
              <span className="font-semibold">{selectedSetting.numericValue}</span>
            </div>
          )}
          {(enableNumericEdit) && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Valoare</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={numericText}
                onChange={(e) => {
                  const txt = e.target.value
                  setNumericText(txt)
                  if (!onSelectedSettingNumericChange) return
                  if (txt.trim() === "") {
                    onSelectedSettingNumericChange(selectedSetting, null)
                    return
                  }
                  const normalized = txt.replace(",", ".")
                  const valid = /^-?\d*(?:\.\d*)?$/.test(normalized)
                  if (!valid) return
                  const num = parseFloat(normalized)
                  if (isNaN(num)) {
                    onSelectedSettingNumericChange(selectedSetting, null)
                  } else {
                    onSelectedSettingNumericChange(selectedSetting, num)
                  }
                }}
                placeholder="0.00"
                className="font-mono"
              />
            </div>
          )}

          {/* Imagine */}
          {selectedSetting.imageUrl && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
                <span>Imagine asociată</span>
              </div>
              <div className="relative w-full h-32 rounded border overflow-hidden bg-white">
                <Image
                  src={selectedSetting.imageUrl}
                  alt={selectedSetting.fileName || "Imagine"}
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => window.open(selectedSetting.imageUrl, '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-2" />
                Deschide imaginea
              </Button>
            </div>
          )}

          {/* Document */}
          {selectedSetting.documentUrl && !selectedSetting.imageUrl && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground truncate flex-1">
                  {selectedSetting.fileName || "Document atașat"}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(selectedSetting.documentUrl, '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-2" />
                Deschide documentul
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


