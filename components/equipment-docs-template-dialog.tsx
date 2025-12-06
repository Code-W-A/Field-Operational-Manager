"use client"

import { useEffect, useRef, useState } from "react"
import type { Setting } from "@/types/settings"
import { subscribeToSettings, subscribeToSettingsByTarget } from "@/lib/firebase/settings"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { FileText, Folder, Info } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface EquipmentDocsTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Return selected settings (template documents) to caller */
  onConfirm: (docs: Setting[]) => void
}

/**
 * Dialog pentru alegerea multiplă a documentelor template de echipament, pe baza structurii din Setări:
 * - părinți legați la target-ul `equipment.documentation.section`
 * - copii (sub-setări) care conțin `documentUrl` / `fileName`
 */
export function EquipmentDocsTemplateDialog({
  open,
  onOpenChange,
  onConfirm,
}: EquipmentDocsTemplateDialogProps): JSX.Element {
  const [parents, setParents] = useState<Setting[]>([])
  const [childrenByParent, setChildrenByParent] = useState<Record<string, Setting[]>>({})
  const [activeParentId, setActiveParentId] = useState<string | null>(null)
  const [path, setPath] = useState<Setting[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const childUnsubsRef = useRef<Record<string, () => void>>({})
  const parentsUnsubRef = useRef<() => void>()

  // Subscribe la părinți + copii DOAR când dialogul este deschis
  useEffect(() => {
    if (!open) {
      parentsUnsubRef.current && parentsUnsubRef.current()
      parentsUnsubRef.current = undefined
      Object.values(childUnsubsRef.current).forEach((u) => u && u())
      childUnsubsRef.current = {}
      setParents([])
      setChildrenByParent({})
      setActiveParentId(null)
      setPath([])
      setSelectedIds([])
      return
    }

    setLoading(true)

    parentsUnsubRef.current = subscribeToSettingsByTarget("equipment.documentation.section", (ps) => {
      const ordered = [...ps].sort((a, b) => (a.order || 0) - (b.order || 0))

      setParents(ordered as Setting[])

      const currentParentIds = new Set(ordered.map((p) => p.id))

      // Dezabonăm părinții eliminați
      for (const id of Object.keys(childUnsubsRef.current)) {
        if (!currentParentIds.has(id)) {
          childUnsubsRef.current[id]!()
          delete childUnsubsRef.current[id]
        }
      }

      // Nu abonăm automat copii; abonăm on-demand când intrăm într-un folder
      setLoading(false)
    })

    return () => {
      parentsUnsubRef.current && parentsUnsubRef.current()
      parentsUnsubRef.current = undefined
      Object.values(childUnsubsRef.current).forEach((u) => u && u())
      childUnsubsRef.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const ensureSubscribed = (parentId: string) => {
    if (childUnsubsRef.current[parentId]) return
    childUnsubsRef.current[parentId] = subscribeToSettings(parentId, (children) => {
      setChildrenByParent((prev) => ({
        ...prev,
        [parentId]: (children as Setting[]).sort((a, b) => (a.order || 0) - (b.order || 0)),
      }))
    })
  }

  const enterFolder = (folder: Setting) => {
    ensureSubscribed(folder.id)
    setActiveParentId(folder.id)
    setPath((prev) => [...prev, folder])
  }

  const goToLevel = (idx: number) => {
    // idx = -1 => root
    if (idx < 0) {
      setPath([])
      setActiveParentId(null)
      return
    }
    setPath((prev) => prev.slice(0, idx + 1))
    const target = path[idx]
    setActiveParentId(target ? target.id : null)
  }

  const normalizeDoc = (item: Setting) => {
    const docUrl =
      item.documentUrl ||
      (typeof (item as any).value === "string" &&
      /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp)$/i.test((item as any).value || "")
        ? (item as any).value
        : "")
    const fileName =
      item.fileName ||
      item.name ||
      (docUrl ? docUrl.split("/").pop() || docUrl : (item as any).value || item.name || "")
    return { ...item, __docUrl: docUrl, __fileName: fileName }
  }

  const handleConfirm = () => {
    const allChildren = Object.values(childrenByParent).flat().map(normalizeDoc)
    const selected = allChildren
      .filter((c) => selectedIds.includes(c.id) && c.__docUrl)
      .map((c) => ({
        ...c,
        documentUrl: c.__docUrl,
        fileName: c.__fileName,
      }))
    if (selected.length === 0) {
      onOpenChange(false)
      return
    }
    onConfirm(selected)
    onOpenChange(false)
    setSelectedIds([])
  }

  const currentList = (activeParentId ? childrenByParent[activeParentId] || [] : parents).map(normalizeDoc)
  const folderItems = currentList.filter((c) => !c.__docUrl)
  const docItems = currentList.filter((c) => !!c.__docUrl)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Adaugă documentație din template-uri</DialogTitle>
          <DialogDescription>
            Selectează documente din categoriile definite în Setări → Variables → equipment.documentation.section.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-4 overflow-hidden pt-2">
          {/* Coloana stângă: navigare foldere */}
          <div className="w-56 flex-shrink-0 border rounded-md bg-muted/40 overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b bg-muted/60 flex items-center gap-1">
              <Folder className="h-3.5 w-3.5" />
              Navigare
            </div>
            <div className="border-b px-3 py-2 text-[11px] text-muted-foreground flex flex-wrap gap-1 items-center">
              <button
                type="button"
                className={cn(
                  "underline-offset-2",
                  path.length === 0 ? "font-semibold text-foreground" : "text-blue-600 hover:underline"
                )}
                onClick={() => goToLevel(-1)}
              >
                Rădăcină
              </button>
              {path.map((p, idx) => (
                <div key={p.id} className="flex items-center gap-1">
                  <span>/</span>
                  <button
                    type="button"
                    className={cn(
                      "underline-offset-2",
                      idx === path.length - 1 ? "font-semibold text-foreground" : "text-blue-600 hover:underline"
                    )}
                    onClick={() => goToLevel(idx)}
                  >
                    {p.name}
                  </button>
                </div>
              ))}
            </div>
            <ScrollArea className="h-[260px]">
              <div className="p-2 space-y-1">
                {loading && !folderItems.length && (
                  <div className="text-xs text-muted-foreground px-2 py-4">Se încarcă...</div>
                )}
                {!loading && !folderItems.length && (
                  <div className="text-xs text-muted-foreground px-2 py-4 space-y-1">
                    <div>Nu există foldere la acest nivel.</div>
                    <div>Configurează în Setări → Variables → equipment.documentation.section.</div>
                  </div>
                )}
                {folderItems.map((p) => {
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => enterFolder(p)}
                      className={cn(
                        "w-full text-left text-xs px-2 py-2 rounded-md flex items-center gap-2 transition-colors hover:bg-muted",
                      )}
                    >
                      <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Coloana dreaptă: documente din nivelul curent */}
          <div className="flex-1 border rounded-md bg-muted/20 flex flex-col overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between border-b bg-muted/40">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span>Documente template</span>
              </div>
              {activeParentId && (
                <div className="text-[11px] text-muted-foreground">
                  {selectedIds.length > 0 ? `${selectedIds.length} selectat(e)` : "Niciun document selectat"}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 h-[260px]">
              <div className="p-3 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {docItems.length === 0 && (
                  <div className="col-span-full text-xs text-muted-foreground flex items-center gap-2">
                    <Info className="h-3.5 w-3.5" />
                    <span>
                      {folderItems.length
                        ? "Selectează un folder din stânga pentru a naviga în ierarhie."
                        : "Nu există documente la acest nivel."}
                    </span>
                  </div>
                )}

                {docItems.map((doc) => {
                    const isSelected = selectedIds.includes(doc.id)
                  const label = (doc as any).__fileName || doc.fileName || doc.name
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => toggleSelected(doc.id)}
                        className={cn(
                        "relative flex flex-col items-start gap-2 p-3 rounded-md border text-left bg-background transition-all hover:shadow-sm",
                          isSelected && "border-blue-500 ring-2 ring-blue-200"
                        )}
                      >
                      <div className="flex items-center gap-2 w-full">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelected(doc.id)}
                          className="mt-0.5"
                        />
                          <div className={cn(
                            "p-1.5 rounded-md",
                            isSelected ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"
                          )}>
                            <FileText className="h-4 w-4" />
                          </div>
                        <span className="text-xs font-medium truncate flex-1" title={label}>
                            {label}
                          </span>
                        </div>
                        {doc.description && (
                          <span className="text-[11px] text-muted-foreground line-clamp-2">
                            {doc.description}
                          </span>
                        )}
                      </button>
                    )
                  })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Anulează
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.length === 0}
            className="w-full sm:w-auto"
          >
            Adaugă documente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


