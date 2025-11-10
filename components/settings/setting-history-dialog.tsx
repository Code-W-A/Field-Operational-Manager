"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Undo2, Clock } from "lucide-react"
import type { Setting, SettingHistory } from "@/types/settings"
import { getSettingHistory } from "@/lib/firebase/settings"
import { format } from "date-fns"
import { ro } from "date-fns/locale"

interface SettingHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  setting: Setting | null
  onRevert?: (historyId: string) => Promise<void>
}

export function SettingHistoryDialog({ open, onOpenChange, setting, onRevert }: SettingHistoryDialogProps) {
  const [history, setHistory] = useState<SettingHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)

  useEffect(() => {
    if (open && setting) {
      setLoading(true)
      getSettingHistory(setting.id)
        .then((data) => {
          setHistory(data)
          setLoading(false)
        })
        .catch((error) => {
          console.error("Error loading history:", error)
          setLoading(false)
        })
    }
  }, [open, setting])

  const handleRevert = async (historyId: string) => {
    if (!onRevert) return
    setReverting(historyId)
    try {
      await onRevert(historyId)
      onOpenChange(false)
    } catch (error) {
      console.error("Error reverting:", error)
    } finally {
      setReverting(null)
    }
  }

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return "—"
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return format(date, "dd MMM yyyy, HH:mm", { locale: ro })
  }

  const getActionBadge = (action: string) => {
    const variants: Record<string, { label: string; variant: any }> = {
      create: { label: "Creat", variant: "default" },
      update: { label: "Modificat", variant: "secondary" },
      delete: { label: "Șters", variant: "destructive" },
      move: { label: "Mutat", variant: "outline" },
      duplicate: { label: "Duplicat", variant: "outline" },
      revert: { label: "Revenire", variant: "outline" },
    }
    const config = variants[action] || { label: action, variant: "outline" }
    return <Badge variant={config.variant as any}>{config.label}</Badge>
  }

  const renderDiff = (before: any, after: any) => {
    if (!before && !after) return null

    const renderValue = (val: any) => {
      if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>
      if (typeof val === "object") return <pre className="text-xs">{JSON.stringify(val, null, 2)}</pre>
      return <span className="font-mono text-sm">{String(val)}</span>
    }

    return (
      <div className="grid grid-cols-2 gap-4 mt-2">
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Înainte</div>
          <div className="p-2 bg-red-50 border border-red-200 rounded text-red-900">
            {renderValue(before)}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">După</div>
          <div className="p-2 bg-green-50 border border-green-200 rounded text-green-900">
            {renderValue(after)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Istoric: {setting?.name}
          </DialogTitle>
          <DialogDescription>
            Toate modificările aduse acestei setări.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4" style={{ maxHeight: "calc(90vh - 200px)" }}>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Se încarcă istoric...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nu există istoric pentru această setare.
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {history.map((entry, index) => (
                <div key={entry.id} className="relative">
                  {index < history.length - 1 && (
                    <div className="absolute left-4 top-12 bottom-0 w-px bg-border" />
                  )}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      {getActionBadge(entry.action)}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-medium">{entry.modifiedByName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatTimestamp(entry.timestamp)}
                          </div>
                        </div>
                        {entry.action !== "delete" && entry.action !== "create" && onRevert && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevert(entry.id)}
                            disabled={reverting === entry.id}
                          >
                            <Undo2 className="h-4 w-4 mr-1" />
                            {reverting === entry.id ? "Se revine..." : "Revenire"}
                          </Button>
                        )}
                      </div>

                      {entry.action === "update" && renderDiff(entry.before, entry.after)}
                      {entry.action === "create" && (
                        <div className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                          Setare creată
                        </div>
                      )}
                      {entry.action === "delete" && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded text-sm">
                          Setare ștearsă
                        </div>
                      )}
                    </div>
                  </div>
                  {index < history.length - 1 && <Separator className="mt-4" />}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

