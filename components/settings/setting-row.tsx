"use client"

import { useState } from "react"
import { MoreVertical, Folder, FileText, Star, Copy, History, Trash2, Plus, GripVertical, Link2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Setting } from "@/types/settings"
import { cn } from "@/lib/utils"
import { SETTINGS_TARGETS } from "@/lib/settings/targets"
import { useAuth } from "@/contexts/AuthContext"
import { updateSetting } from "@/lib/firebase/settings"
import { toast } from "@/hooks/use-toast"

interface SettingRowProps {
  setting: Setting
  onNavigate?: (setting: Setting) => void
  onEdit?: (setting: Setting) => void
  onDelete?: (setting: Setting) => void
  onDuplicate?: (setting: Setting, deepClone: boolean) => void
  onToggleFavorite?: (setting: Setting) => void
  onViewHistory?: (setting: Setting) => void
  onAddChild?: (parentSetting: Setting) => void
  dragHandleProps?: any
  selected?: boolean
  onToggleSelect?: (setting: Setting) => void
  showCheckbox?: boolean
}

export function SettingRow({
  setting,
  onNavigate,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleFavorite,
  onViewHistory,
  onAddChild,
  dragHandleProps,
  selected = false,
  onToggleSelect,
  showCheckbox = false,
}: SettingRowProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [showBindDialog, setShowBindDialog] = useState(false)
  const [selectedTargets, setSelectedTargets] = useState<string[]>(Array.isArray(setting.assignedTargets) ? setting.assignedTargets : [])
  const { userData } = useAuth()

  const handleRowClick = () => {
    if (onNavigate) {
      onNavigate(setting)
    }
  }

  const handleDelete = () => {
    setShowDeleteDialog(false)
    onDelete?.(setting)
  }

  return (
    <>
      <div
        className={cn(
          "group w-full rounded-md border bg-background hover:bg-muted/50 transition-all px-3 py-2",
        )}
      >
        <div className="flex items-center gap-3">
          {dragHandleProps && (
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          {showCheckbox && (
            <div
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect?.(setting)}
                aria-label="Selectează setarea"
              />
            </div>
          )}

          <button onClick={handleRowClick} className="flex items-start gap-3 flex-1 min-w-0 text-left">
            <div className="mt-0.5">
              <div className="p-1.5 rounded-md bg-muted/40">
                <Folder className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="truncate font-medium">{setting.name}</div>
                {setting.favorite && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
              </div>
              {setting.description && (
                <div className="text-xs text-muted-foreground truncate">{setting.description}</div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {setting.type === "variable" && setting.valueType && (
                  <Badge variant="outline" className="text-xs">
                    <span className="capitalize">{setting.valueType}</span>
                  </Badge>
                )}
                {setting.type === "variable" && setting.value !== undefined && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-muted/50 rounded text-[11px] font-mono truncate max-w-[280px]">
                    {typeof setting.value === "object" ? JSON.stringify(setting.value) : String(setting.value)}
                  </div>
                )}
                {setting.path && (
                  <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[320px]">
                    {setting.path}
                  </div>
                )}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowBindDialog(true)}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Leagă la…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {onAddChild && (
                  <>
                    <DropdownMenuItem onClick={() => onAddChild(setting)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adaugă subsetare
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(setting)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Editează
                  </DropdownMenuItem>
                )}
                {onDuplicate && (
                  <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplică
                  </DropdownMenuItem>
                )}
                {onToggleFavorite && (
                  <DropdownMenuItem onClick={() => onToggleFavorite(setting)}>
                    <Star className="mr-2 h-4 w-4" />
                    {setting.favorite ? "Elimină din favorite" : "Adaugă la favorite"}
                  </DropdownMenuItem>
                )}
                {onViewHistory && (
                  <DropdownMenuItem onClick={() => onViewHistory(setting)}>
                    <History className="mr-2 h-4 w-4" />
                    Istoric
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {onDelete && (
                  <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Șterge
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Bind targets dialog */}
      <AlertDialog open={showBindDialog} onOpenChange={setShowBindDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leagă setarea de dialoguri/aplicație</AlertDialogTitle>
            <AlertDialogDescription>
              Selectează unde vrei să fie folosit acest element ca listă sau valoare în aplicație.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[360px] overflow-y-auto space-y-3">
            {Object.entries(
              SETTINGS_TARGETS
                // Afișăm ținte pentru dialoguri + țintele specifice aplicației (ex: Revizie, Echipament documente)
                .filter((t) => t.id.startsWith("dialogs.") || t.id.startsWith("revisions.") || t.id === "equipment.documentation.section")
                .reduce<Record<string, typeof SETTINGS_TARGETS>>((acc, t) => {
                const [rawGroup, rawLeaf] = String(t.label || "").split("→")
                const group = (rawGroup || "Altele").trim()
                const leaf = (rawLeaf || t.label).trim()
                const entry = { ...t, label: leaf }
                if (!acc[group]) acc[group] = []
                acc[group].push(entry)
                return acc
              }, {})
            ).sort(([a], [b]) => a.localeCompare(b, "ro", { sensitivity: "base" })).map(([group, items]) => (
              <div key={group} className="border rounded-md">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/40">
                  {group}
                </div>
                <div className="p-2 space-y-2">
                  {items.map((t) => {
                    const checked = selectedTargets.includes(t.id)
                    return (
                      <label
                        key={t.id}
                        className="flex items-start gap-3 p-2 rounded border hover:bg-muted/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) => {
                            const v = Boolean(val)
                            setSelectedTargets((prev) => {
                              if (v) return prev.includes(t.id) ? prev : [...prev, t.id]
                              return prev.filter((x) => x !== t.id)
                            })
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground capitalize">Tip: {t.kind}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await updateSetting(
                    setting.id,
                    { assignedTargets: selectedTargets },
                    userData?.uid || "",
                    userData?.displayName || "Utilizator"
                  )
                  toast({ title: "Legături salvate" })
                } catch (e) {
                  toast({ title: "Eroare la salvare legături", variant: "destructive" })
                }
              }}
            >
              Salvează
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmare ștergere</AlertDialogTitle>
            <AlertDialogDescription>
              Ești sigur că vrei să ștergi "{setting.name}"?
              {setting.type === "category" && (
                <span className="block mt-2 font-semibold text-red-600">
                  Atenție: Toate subsetările vor fi șterse de asemenea!
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Șterge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicare setare</AlertDialogTitle>
            <AlertDialogDescription>
              Vrei să duplici și subsetările acestui element?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:justify-end">
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            {onDuplicate && (
              <>
                <AlertDialogAction
                  onClick={() => {
                    setShowDuplicateDialog(false)
                    onDuplicate(setting, false)
                  }}
                >
                  Doar setarea
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => {
                    setShowDuplicateDialog(false)
                    onDuplicate(setting, true)
                  }}
                >
                  Cu subsetări
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}


